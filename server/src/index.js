import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import mongoose from 'mongoose'
import { config, assertProductionConfig } from './config.js'
import { Booking, Inquiry, Otp, Payment, Showground } from './models.js'
import { initiateStkPush } from './providers/daraja.js'
import { sendSms } from './providers/talksasa.js'

const app = express()
const phonePattern = /^(?:\+254|0)(?:7|1)\d{8}$/
const otpSecret = process.env.OTP_SECRET || 'county-plot-hub-local-otp-secret'

app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.clientOrigin.split(',').map((item) => item.trim()).includes(origin) || config.clientOrigin === '*') return callback(null, true)
    return callback(new Error('Origin is not allowed by the API'))
  }
}))
app.use(express.json({ limit: '1mb' }))
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }))

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const httpError = (status, message, code = 'REQUEST_ERROR') => Object.assign(new Error(message), { status, code })
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const newToken = () => crypto.randomBytes(24).toString('base64url')
const cleanPhone = (value = '') => value.replace(/\s+/g, '')
const validPhone = (value) => phonePattern.test(cleanPhone(value))
const phoneForMpesa = (value) => cleanPhone(value).replace(/^\+/, '')

function seasonIsOpen(season, now = new Date()) {
  if (!season?.startMonth || !season?.endMonth) return true
  const range = (year) => {
    const start = new Date(year, season.startMonth - 1, 1)
    const endYear = season.endMonth < season.startMonth ? year + 1 : year
    const end = new Date(endYear, season.endMonth, 0, 23, 59, 59, 999)
    return { start, end }
  }
  return [range(now.getFullYear() - 1), range(now.getFullYear()), range(now.getFullYear() + 1)].some((item) => now >= item.start && now <= item.end)
}

function publicBooking(booking) {
  return {
    id: booking._id.toString(),
    showgroundId: booking.showgroundId,
    plotId: booking.plotId,
    exhibitorName: booking.exhibitorName,
    phone: booking.phone,
    exhibitorCount: booking.exhibitorCount,
    powerNeed: booking.powerNeed,
    signageText: booking.signageText,
    setupDate: booking.setupDate,
    competitionOptIn: booking.competitionOptIn,
    amount: booking.amount,
    status: booking.status,
    permitRef: booking.permitRef,
    expiresAt: booking.expiresAt,
    createdAt: booking.createdAt
  }
}

function paymentPublic(payment) {
  if (!payment) return null
  return {
    id: payment._id.toString(),
    provider: payment.provider,
    status: payment.status,
    checkoutRequestId: payment.checkoutRequestId,
    resultDescription: payment.resultDescription,
    mpesaReceiptNumber: payment.mpesaReceiptNumber
  }
}

async function releasePlot(booking) {
  await Showground.updateOne(
    { id: booking.showgroundId, plots: { $elemMatch: { id: booking.plotId, status: 'reserved' } } },
    { $set: { 'plots.$.status': 'available' } }
  )
}

async function confirmPayment(paymentId, result = {}) {
  const payment = await Payment.findById(paymentId)
  if (!payment) return null
  if (payment.status === 'success') return Booking.findById(payment.bookingId)
  const booking = await Booking.findById(payment.bookingId)
  if (!booking) return null
  const success = Boolean(result.success)
  payment.status = success ? 'success' : 'failed'
  payment.resultCode = result.resultCode
  payment.resultDescription = result.resultDescription
  payment.mpesaReceiptNumber = result.mpesaReceiptNumber
  if (result.rawCallback) payment.rawCallback = result.rawCallback
  await payment.save()
  if (success) {
    const permitRef = booking.permitRef || `CPH-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    await Booking.updateOne({ _id: booking._id, status: { $in: ['reserved', 'pending_payment'] } }, { $set: { status: 'confirmed', permitRef, lastPaymentId: payment._id } })
    await Showground.updateOne(
      { id: booking.showgroundId, plots: { $elemMatch: { id: booking.plotId, status: 'reserved' } } },
      { $set: { 'plots.$.status': 'taken' } }
    )
    await sendSms({
      phone: booking.phone,
      message: `County Plot Hub: payment confirmed for plot ${booking.plotId}. Permit ${permitRef}. Keep this message for gate entry.`
    }).catch((error) => console.error('Confirmation SMS failed:', error.message))
  } else {
    await Booking.updateOne({ _id: booking._id, status: { $in: ['reserved', 'pending_payment'] } }, { $set: { status: 'failed', lastPaymentId: payment._id } })
    await releasePlot(booking)
  }
  return Booking.findById(booking._id)
}

app.get('/health', asyncRoute(async (req, res) => {
  res.json({ ok: true, service: 'county-plot-hub-api', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', demoMode: config.demoMode })
}))

app.get('/api/showgrounds', asyncRoute(async (req, res) => {
  const showgrounds = await Showground.find({}).sort({ county: 1 }).lean()
  res.json({ showgrounds })
}))

app.get('/api/showgrounds/:id', asyncRoute(async (req, res) => {
  const showground = await Showground.findOne({ id: req.params.id }).lean()
  if (!showground) throw httpError(404, 'Showground not found', 'NOT_FOUND')
  res.json({ showground })
}))

app.post('/api/otp/request', asyncRoute(async (req, res) => {
  const phone = cleanPhone(req.body.phone)
  if (!validPhone(phone)) throw httpError(400, 'Enter a valid Kenyan mobile number.', 'INVALID_PHONE')
  const code = String(crypto.randomInt(100000, 1000000))
  await Otp.deleteMany({ phone, status: 'pending' })
  await Otp.create({
    phone,
    codeHash: sha256(`${code}:${otpSecret}`),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000)
  })
  await sendSms({ phone: phoneForMpesa(phone), message: `County Plot Hub verification code: ${code}. It expires in 10 minutes.` })
  res.json({ ok: true, message: 'Verification code sent.', ...(config.demoMode ? { demoCode: code } : {}) })
}))

app.post('/api/otp/verify', asyncRoute(async (req, res) => {
  const phone = cleanPhone(req.body.phone)
  const code = String(req.body.code || '').trim()
  if (!validPhone(phone) || !/^\d{6}$/.test(code)) throw httpError(400, 'Enter the six-digit code sent to your phone.', 'INVALID_OTP')
  const record = await Otp.findOne({ phone, status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 })
  if (!record) throw httpError(400, 'That code has expired. Request a new code.', 'OTP_EXPIRED')
  if (record.attempts >= 5) throw httpError(429, 'Too many attempts. Request a new code.', 'OTP_LOCKED')
  record.attempts += 1
  if (record.codeHash !== sha256(`${code}:${otpSecret}`)) {
    await record.save()
    throw httpError(400, 'Incorrect verification code.', 'OTP_INVALID')
  }
  record.status = 'verified'
  record.sessionToken = newToken()
  await record.save()
  res.json({ ok: true, verificationToken: record.sessionToken })
}))

app.post('/api/bookings', asyncRoute(async (req, res) => {
  const { showgroundId, plotId, exhibitorName, exhibitorCount, powerNeed, signageText, setupDate, competitionOptIn, otpToken } = req.body
  const phone = cleanPhone(req.body.phone)
  if (!showgroundId || !plotId || !String(exhibitorName || '').trim() || !validPhone(phone) || !otpToken) throw httpError(400, 'Complete the exhibitor details and verify the phone number.', 'VALIDATION_ERROR')
  const otp = await Otp.findOne({ phone, sessionToken: otpToken, status: 'verified', expiresAt: { $gt: new Date() } })
  if (!otp) throw httpError(400, 'Phone verification is required before booking.', 'PHONE_NOT_VERIFIED')
  const showground = await Showground.findOne({ id: showgroundId })
  if (!showground) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  if (!seasonIsOpen(showground.season)) throw httpError(409, 'This showground is outside its leasing window.', 'SEASON_CLOSED')
  const plot = showground.plots.find((item) => item.id === plotId)
  const count = Number(exhibitorCount || 1)
  if (!plot) throw httpError(404, 'Plot not found.', 'NOT_FOUND')
  if (!Number.isInteger(count) || count < 1 || count > plot.exhibitorsCapacity) throw httpError(400, `This plot allows up to ${plot.exhibitorsCapacity} exhibitors.`, 'CAPACITY_EXCEEDED')
  if (!['none', 'single', 'three'].includes(powerNeed || 'none')) throw httpError(400, 'Invalid power requirement.', 'VALIDATION_ERROR')

  const reserved = await Showground.findOneAndUpdate(
    { id: showgroundId, plots: { $elemMatch: { id: plotId, status: 'available' } } },
    { $set: { 'plots.$.status': 'reserved' } },
    { new: true }
  )
  if (!reserved) throw httpError(409, 'That plot is no longer available. Choose another plot.', 'PLOT_UNAVAILABLE')
  let booking
  try {
    booking = await Booking.create({
      showgroundId,
      plotId,
      exhibitorName: String(exhibitorName).trim(),
      phone,
      exhibitorCount: count,
      powerNeed: powerNeed || 'none',
      signageText: String(signageText || '').trim().slice(0, 160),
      setupDate,
      competitionOptIn: Boolean(competitionOptIn),
      amount: plot.price,
      status: 'reserved',
      expiresAt: new Date(Date.now() + config.bookingHoldMinutes * 60 * 1000)
    })
    otp.status = 'consumed'
    await otp.save()
  } catch (error) {
    await Showground.updateOne({ id: showgroundId, plots: { $elemMatch: { id: plotId, status: 'reserved' } } }, { $set: { 'plots.$.status': 'available' } })
    throw error
  }
  res.status(201).json({ booking: publicBooking(booking) })
}))

app.get('/api/bookings/:id', asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid booking reference.', 'INVALID_ID')
  const booking = await Booking.findById(req.params.id)
  if (!booking) throw httpError(404, 'Booking not found.', 'NOT_FOUND')
  const payment = await Payment.findOne({ bookingId: booking._id })
  res.json({ booking: publicBooking(booking), payment: paymentPublic(payment) })
}))

app.post('/api/payments/stk', asyncRoute(async (req, res) => {
  const { bookingId } = req.body
  const phone = cleanPhone(req.body.phone)
  if (!mongoose.isValidObjectId(bookingId) || !validPhone(phone)) throw httpError(400, 'A valid booking and phone number are required.', 'VALIDATION_ERROR')
  const booking = await Booking.findById(bookingId)
  if (!booking) throw httpError(404, 'Booking not found.', 'NOT_FOUND')
  if (!['reserved', 'pending_payment'].includes(booking.status) || (booking.expiresAt && booking.expiresAt <= new Date())) throw httpError(409, 'This booking is no longer payable.', 'BOOKING_NOT_PAYABLE')
  let payment = await Payment.findOne({ bookingId: booking._id })
  if (payment?.status === 'success') return res.json({ payment: paymentPublic(payment), booking: publicBooking(booking) })
  booking.status = 'pending_payment'
  await booking.save()
  if (!payment) payment = await Payment.create({ bookingId: booking._id, phone, amount: booking.amount, provider: config.demoMode ? 'demo' : 'daraja', status: 'initiated' })
  if (config.demoMode) {
    payment.status = 'pending'
    payment.checkoutRequestId = `demo-${booking._id}`
    await payment.save()
    setTimeout(() => confirmPayment(payment._id, { success: true, resultCode: '0', resultDescription: 'Demo payment confirmed' }).catch((error) => console.error('Demo payment failed:', error.message)), 2500)
    return res.json({ demo: true, payment: paymentPublic(payment), booking: publicBooking(booking) })
  }
  try {
    const result = await initiateStkPush({ phone, amount: booking.amount, accountReference: `CPH${booking._id.toString().slice(-8)}`, description: `Plot ${booking.plotId} booking` })
    payment.status = 'pending'
    payment.merchantRequestId = result.MerchantRequestID
    payment.checkoutRequestId = result.CheckoutRequestID
    payment.resultDescription = result.ResponseDescription
    await payment.save()
    res.json({ demo: false, payment: paymentPublic(payment), booking: publicBooking(booking) })
  } catch (error) {
    await confirmPayment(payment._id, { success: false, resultCode: 'PROVIDER_ERROR', resultDescription: error.message })
    throw httpError(502, error.message, 'PAYMENT_PROVIDER_ERROR')
  }
}))

app.post('/api/payments/daraja/callback', asyncRoute(async (req, res) => {
  const callback = req.body?.Body?.stkCallback
  if (!callback?.CheckoutRequestID) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  const success = String(callback.ResultCode) === '0'
  const metadata = Object.fromEntries((callback.CallbackMetadata?.Item || []).map((item) => [item.Name, item.Value]))
  const payment = await Payment.findOne({ checkoutRequestId: callback.CheckoutRequestID })
  if (payment) {
    await confirmPayment(payment._id, {
      success,
      resultCode: String(callback.ResultCode),
      resultDescription: callback.ResultDesc,
      mpesaReceiptNumber: metadata.MpesaReceiptNumber,
      rawCallback: req.body
    })
  } else {
    console.warn('Daraja callback did not match a payment:', callback.CheckoutRequestID)
  }
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' })
}))

app.post('/api/inquiries', asyncRoute(async (req, res) => {
  const { showgroundId, plotId, message } = req.body
  const phone = cleanPhone(req.body.phone)
  if (!showgroundId || !plotId || !String(message || '').trim() || !validPhone(phone)) throw httpError(400, 'A valid phone number and question are required.', 'VALIDATION_ERROR')
  const inquiry = await Inquiry.create({ showgroundId, plotId, phone, message: String(message).trim().slice(0, 1000) })
  res.status(201).json({ ok: true, inquiry: { id: inquiry._id.toString(), status: inquiry.status } })
}))

app.use((error, req, res, next) => {
  console.error(error)
  const status = error.status || (error.name === 'ValidationError' ? 400 : 500)
  res.status(status).json({ error: status >= 500 ? 'The server could not complete that request.' : error.message, code: error.code || 'SERVER_ERROR' })
})

async function expireStaleBookings() {
  const stale = await Booking.find({ status: { $in: ['reserved', 'pending_payment'] }, expiresAt: { $lte: new Date() } })
  for (const booking of stale) {
    await Booking.updateOne({ _id: booking._id, status: { $in: ['reserved', 'pending_payment'] } }, { $set: { status: 'expired' } })
    await releasePlot(booking)
  }
  if (stale.length) console.log(`Released ${stale.length} expired booking hold(s)`)
}

assertProductionConfig()
<<<<<<< HEAD
await mongoose.connect(config.mongoUri)
console.log(`MongoDB connected (${config.nodeEnv}; demo mode: ${config.demoMode})`)
setInterval(() => expireStaleBookings().catch((error) => console.error('Expiry cleanup failed:', error.message)), 60 * 1000).unref()
app.listen(config.port, () => console.log(`County Plot Hub API listening on port ${config.port}`))
=======

const httpServer = app.listen(config.port, () => {
  console.log(`County Plot Hub API listening on port ${config.port}`)
})

async function connectDatabase() {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000
    })
    console.log(`MongoDB connected (${config.nodeEnv}; demo mode: ${config.demoMode})`)
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`)
    console.error('Retrying MongoDB connection in 15 seconds. Check Atlas Network Access, credentials, and MONGODB_URI.')
    setTimeout(connectDatabase, 15000).unref()
  }
}

connectDatabase()
setInterval(() => expireStaleBookings().catch((error) => console.error('Expiry cleanup failed:', error.message)), 60 * 1000).unref()

const shutdown = async () => {
  httpServer.close()
  await mongoose.disconnect().catch(() => {})
  process.exit(0)
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
>>>>>>> master
