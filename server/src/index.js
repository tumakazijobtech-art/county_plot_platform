import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import mongoose from 'mongoose'
import { config, assertProductionConfig } from './config.js'
import { AdminSession, AdminUser, Booking, Inquiry, Otp, PasswordReset, Payment, Showground, SiteSettings, Visitor } from './models.js'
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
// 6mb accommodates a base64-encoded site-plan image upload (see the
// /site-plan admin route); ordinary API bodies stay far below this.
app.use(express.json({ limit: '6mb' }))
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'))
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }))

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const httpError = (status, message, code = 'REQUEST_ERROR') => Object.assign(new Error(message), { status, code })
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
const newToken = () => crypto.randomBytes(24).toString('base64url')
const cleanPhone = (value = '') => value.replace(/\s+/g, '')
const validPhone = (value) => phonePattern.test(cleanPhone(value))
const phoneForMpesa = (value) => cleanPhone(value).replace(/^\+/, '')
const phoneForWhatsApp = (value) => cleanPhone(String(value || '')).replace(/^\+/, '').replace(/^0/, '254')
const cleanEmail = (value = '') => String(value).trim().toLowerCase()
const passwordHash = (password, salt = crypto.randomBytes(16).toString('hex')) => new Promise((resolve, reject) => {
  crypto.scrypt(String(password), salt, 64, (error, derivedKey) => {
    if (error) return reject(error)
    resolve(`${salt}:${derivedKey.toString('hex')}`)
  })
})
const passwordMatches = async (password, storedHash) => {
  const [salt, expected] = String(storedHash || '').split(':')
  if (!salt || !expected) return false
  const actual = await passwordHash(password, salt)
  const actualBuffer = Buffer.from(actual.split(':')[1], 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

const publicAdmin = (admin) => ({ id: admin._id.toString(), email: admin.email, name: admin.name, role: admin.role, showgroundIds: Array.isArray(admin.showgroundIds) ? admin.showgroundIds : [] })
const defaultThemeColors = { primary: '#2b4034', accent: '#4c7a5d', background: '#f2f4ee', surface: '#ffffff', text: '#232a22' }
const defaultPublicSettings = { key: 'primary', siteName: 'County Showgrounds', logoUrl: '/county-showgrounds-logo.png', supportPhone: '', themeColors: defaultThemeColors }
const isHexColor = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value || ''))
const isSuperAdmin = (admin) => admin?.role === 'admin'
const groundScope = (admin) => isSuperAdmin(admin) ? {} : { id: { $in: admin?.showgroundIds || [] } }
const bookingScope = (admin) => isSuperAdmin(admin) ? {} : { showgroundId: { $in: admin?.showgroundIds || [] } }
const visitorScope = (admin) => isSuperAdmin(admin) ? {} : { showgroundId: { $in: admin?.showgroundIds || [] } }
const requireSuperAdmin = (req, res, next) => {
  if (!isSuperAdmin(req.admin)) return next(httpError(403, 'Only the primary administrator can perform this action.', 'ADMIN_FORBIDDEN'))
  return next()
}
const slugify = (value) => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

// --- Plot boundary (GeoJSON Polygon) helpers -------------------------------
// A boundary is stored as a single-ring Polygon: [[ [lng,lat], [lng,lat], ..., [lng,lat] ]]
// with the first and last point identical (a closed ring), per the GeoJSON spec.
function cleanBoundary(input) {
  if (!input || typeof input !== 'object' || input.type !== 'Polygon') return undefined
  const ring = Array.isArray(input.coordinates) ? input.coordinates[0] : undefined
  if (!Array.isArray(ring)) return undefined
  const points = ring
    .filter((point) => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter((point) => point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)
  // Drop a duplicated closing point before de-duplicating consecutive repeats.
  const deduped = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1])
  if (deduped.length && deduped.length > 1) {
    const first = deduped[0]
    const last = deduped[deduped.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) deduped.pop()
  }
  if (deduped.length < 3) return undefined
  return { type: 'Polygon', coordinates: [[...deduped, deduped[0]]] }
}

function segmentsIntersect(p1, p2, p3, p4) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
function pointInRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > point[1]) !== (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
function ringsOverlap(ringA, ringB) {
  for (let i = 0; i < ringA.length - 1; i++) {
    for (let j = 0; j < ringB.length - 1; j++) {
      if (segmentsIntersect(ringA[i], ringA[i + 1], ringB[j], ringB[j + 1])) return true
    }
  }
  return pointInRing(ringA[0], ringB) || pointInRing(ringB[0], ringA)
}
function boundariesOverlap(a, b) {
  const ringA = a?.coordinates?.[0]
  const ringB = b?.coordinates?.[0]
  if (!ringA || !ringB || ringA.length < 4 || ringB.length < 4) return false
  return ringsOverlap(ringA, ringB)
}
// Returns the IDs of any other plots in the same showground whose boundary
// overlaps this one. Used to WARN the admin, not to block saving — a small
// overlap may be intentional while shapes are still being corrected.
function findOverlaps(plots, plotId, boundary) {
  if (!boundary) return []
  return plots.filter((plot) => plot.id !== plotId && plot.boundary && boundariesOverlap(plot.boundary, boundary)).map((plot) => plot.id)
}

const cleanPlot = (plot = {}, fallbackId = '') => ({
  id: String(plot.id || fallbackId).trim(),
  category: String(plot.category || 'Open ground').trim().slice(0, 100),
  size: String(plot.size || '3x3m').trim().slice(0, 30),
  price: Number(plot.price || 0),
  status: ['available', 'reserved', 'taken'].includes(plot.status) ? plot.status : 'available',
  exhibitorsCapacity: Math.max(1, Number(plot.exhibitorsCapacity ?? plot.exhibitors_capacity ?? 1)),
  traffic: ['high', 'medium', 'low'].includes(plot.traffic) ? plot.traffic : 'medium',
  offsetN: Number(plot.offsetN || 0),
  offsetE: Number(plot.offsetE || 0),
  boundary: cleanBoundary(plot.boundary)
})
const publicVisitor = (visitor) => ({
  id: visitor._id.toString(),
  showgroundId: visitor.showgroundId,
  fullName: visitor.fullName,
  phone: visitor.phone,
  permitRef: visitor.permitRef,
  visitDate: visitor.visitDate,
  status: visitor.status,
  note: visitor.note,
  approvedAt: visitor.approvedAt,
  lastScannedAt: visitor.lastScannedAt,
  createdAt: visitor.createdAt
})

async function sendPasswordResetEmail(admin, resetUrl) {
  if (config.email.provider !== 'brevo' || !config.email.apiKey) {
    if (!config.demoMode) throw httpError(503, 'Password reset email is not configured. Add a Brevo API key before using this in production.', 'EMAIL_NOT_CONFIGURED')
    console.log(`Password reset link for ${admin.email}: ${resetUrl}`)
    return { delivered: false, demo: true }
  }
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': config.email.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: config.email.fromEmail, name: config.email.fromName },
      to: [{ email: admin.email, name: admin.name }],
      subject: 'Reset your County Showgrounds admin password',
      htmlContent: `<div style="font-family:Arial,sans-serif;color:#232a22"><h2>Reset your admin password</h2><p>Use the secure link below to choose a new password. It expires in 30 minutes.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p></div>`
    })
  })
  if (!response.ok) throw httpError(502, 'The password reset email could not be sent.', 'EMAIL_PROVIDER_ERROR')
  return { delivered: true, demo: false }
}

async function ensureAdminUser() {
  const email = cleanEmail(config.admin.email)
  const existing = await AdminUser.findOne({ email })
  if (existing) return existing
  const created = await AdminUser.create({ email, name: config.admin.name, passwordHash: await passwordHash(config.admin.password), role: 'admin' })
  console.log(`Created initial admin account ${email}. Change the password after first login.`)
  return created
}

async function adminAuth(req, res, next) {
  const authorization = String(req.headers.authorization || '')
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return next(httpError(401, 'Admin login is required.', 'ADMIN_UNAUTHENTICATED'))
  const session = await AdminSession.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).populate('adminId')
  if (!session?.adminId?.active) return next(httpError(401, 'Your admin session has expired. Please log in again.', 'ADMIN_SESSION_EXPIRED'))
  req.admin = session.adminId
  req.adminSession = session
  return next()
}
const requireAdmin = (req, res, next) => adminAuth(req, res, next).catch(next)

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
    approvalStatus: booking.approvalStatus || 'approved',
    approvalNote: booking.approvalNote,
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

app.get('/api/settings', asyncRoute(async (req, res) => {
  const settings = await SiteSettings.findOne({ key: 'primary' }).lean()
  res.json({ settings: settings || defaultPublicSettings })
}))

app.post('/api/admin/auth/login', asyncRoute(async (req, res) => {
  const email = cleanEmail(req.body.email)
  const password = String(req.body.password || '')
  if (!email || !password) throw httpError(400, 'Email and password are required.', 'LOGIN_REQUIRED')
  const admin = await AdminUser.findOne({ email, active: true })
  if (!admin || !(await passwordMatches(password, admin.passwordHash))) throw httpError(401, 'The email or password is incorrect.', 'LOGIN_INVALID')
  const token = newToken()
  await AdminSession.create({ adminId: admin._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) })
  res.json({ token, admin: publicAdmin(admin) })
}))

app.post('/api/admin/auth/forgot-password', asyncRoute(async (req, res) => {
  const email = cleanEmail(req.body.email)
  const generic = { ok: true, message: 'If an admin account exists for that email, a reset link has been sent.' }
  const admin = await AdminUser.findOne({ email, active: true })
  if (!admin) return res.json(generic)
  await PasswordReset.deleteMany({ adminId: admin._id })
  const token = newToken()
  await PasswordReset.create({ adminId: admin._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) })
  const resetUrl = `${config.appOrigin}/admin/reset-password?token=${encodeURIComponent(token)}`
  const delivery = await sendPasswordResetEmail(admin, resetUrl)
  res.json({ ...generic, ...(config.demoMode || delivery.demo ? { resetUrl } : {}) })
}))

app.post('/api/admin/auth/reset-password', asyncRoute(async (req, res) => {
  const token = String(req.body.token || '').trim()
  const password = String(req.body.password || '')
  if (!token || password.length < 8) throw httpError(400, 'Use a reset link and a password of at least 8 characters.', 'RESET_INVALID')
  const reset = await PasswordReset.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } })
  if (!reset) throw httpError(400, 'This reset link is invalid or has expired.', 'RESET_EXPIRED')
  const admin = await AdminUser.findById(reset.adminId)
  if (!admin) throw httpError(400, 'This reset link is invalid or has expired.', 'RESET_EXPIRED')
  admin.passwordHash = await passwordHash(password)
  await admin.save()
  await PasswordReset.deleteMany({ adminId: admin._id })
  await AdminSession.deleteMany({ adminId: admin._id })
  res.json({ ok: true, message: 'Password updated. You can now log in.' })
}))

app.get('/api/admin/auth/me', requireAdmin, asyncRoute(async (req, res) => {
  res.json({ admin: publicAdmin(req.admin) })
}))

app.get('/api/admin/managers', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const managers = await AdminUser.find({ role: 'manager' }).select('-passwordHash').sort({ name: 1 }).lean()
  res.json({ managers: managers.map(publicAdmin) })
}))

app.post('/api/admin/managers', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const email = cleanEmail(req.body.email)
  const name = String(req.body.name || '').trim()
  const password = String(req.body.password || '')
  const showgroundIds = Array.isArray(req.body.showgroundIds) ? [...new Set(req.body.showgroundIds.map((id) => String(id).trim()).filter(Boolean))] : []
  if (!email || !email.includes('@') || !name || password.length < 8 || !showgroundIds.length) throw httpError(400, 'Name, valid email, password, and at least one showground are required.', 'VALIDATION_ERROR')
  const validGrounds = await Showground.countDocuments({ id: { $in: showgroundIds } })
  if (validGrounds !== showgroundIds.length) throw httpError(400, 'One or more assigned showgrounds do not exist.', 'INVALID_ASSIGNMENT')
  if (await AdminUser.exists({ email })) throw httpError(409, 'An account with that email already exists.', 'DUPLICATE_EMAIL')
  const manager = await AdminUser.create({ email, name, passwordHash: await passwordHash(password), role: 'manager', showgroundIds })
  res.status(201).json({ manager: publicAdmin(manager) })
}))

app.put('/api/admin/managers/:id', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid manager ID.', 'INVALID_ID')
  const manager = await AdminUser.findOne({ _id: req.params.id, role: 'manager' })
  if (!manager) throw httpError(404, 'Manager not found.', 'NOT_FOUND')
  const email = cleanEmail(req.body.email)
  const name = String(req.body.name || '').trim()
  const showgroundIds = Array.isArray(req.body.showgroundIds) ? [...new Set(req.body.showgroundIds.map((id) => String(id).trim()).filter(Boolean))] : []
  if (!email || !email.includes('@') || !name || !showgroundIds.length) throw httpError(400, 'Name, valid email, and at least one showground are required.', 'VALIDATION_ERROR')
  if (await AdminUser.exists({ email, _id: { $ne: manager._id } })) throw httpError(409, 'An account with that email already exists.', 'DUPLICATE_EMAIL')
  if (await Showground.countDocuments({ id: { $in: showgroundIds } }) !== showgroundIds.length) throw httpError(400, 'One or more assigned showgrounds do not exist.', 'INVALID_ASSIGNMENT')
  const emailChanged = manager.email !== email
  manager.email = email
  manager.name = name
  manager.showgroundIds = showgroundIds
  const passwordChanged = Boolean(String(req.body.password || ''))
  if (passwordChanged) {
    if (String(req.body.password).length < 8) throw httpError(400, 'A new password must be at least 8 characters.', 'VALIDATION_ERROR')
    manager.passwordHash = await passwordHash(req.body.password)
  }
  await manager.save()
  if (passwordChanged || emailChanged) await AdminSession.deleteMany({ adminId: manager._id })
  res.json({ manager: publicAdmin(manager) })
}))

app.delete('/api/admin/managers/:id', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(400, 'Invalid manager ID.', 'INVALID_ID')
  const manager = await AdminUser.findOneAndDelete({ _id: req.params.id, role: 'manager' })
  if (!manager) throw httpError(404, 'Manager not found.', 'NOT_FOUND')
  await AdminSession.deleteMany({ adminId: manager._id })
  res.json({ ok: true, id: req.params.id })
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

app.get('/api/permits/:permitRef', asyncRoute(async (req, res) => {
  const permitRef = decodeURIComponent(req.params.permitRef || '').trim()
  if (!permitRef) throw httpError(400, 'A permit reference is required.', 'INVALID_PERMIT')
  const booking = await Booking.findOne({ permitRef, status: 'confirmed' }).lean()
  if (!booking) throw httpError(404, 'This permit could not be verified.', 'PERMIT_NOT_FOUND')
  const showground = await Showground.findOne({ id: booking.showgroundId }).lean()
  const plot = showground?.plots?.find((item) => item.id === booking.plotId)
  res.json({
    permit: {
      permitRef: booking.permitRef,
      status: booking.status,
      exhibitorName: booking.exhibitorName,
      exhibitorCount: booking.exhibitorCount,
      powerNeed: booking.powerNeed,
      signageText: booking.signageText,
      setupDate: booking.setupDate,
      competitionOptIn: booking.competitionOptIn,
      amount: booking.amount,
      showgroundName: showground?.name || booking.showgroundId,
      county: showground?.county || '',
      plotId: booking.plotId,
      category: plot?.category || '',
      size: plot?.size || ''
    }
  })
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
  const showground = await Showground.findOne({ id: showgroundId }).lean()
  if (!showground) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  const inquiry = await Inquiry.create({ showgroundId, plotId, phone, message: String(message).trim().slice(0, 1000) })
  const whatsappNumber = String(showground.whatsappNumber || '').trim()
  const whatsappUrl = whatsappNumber ? `https://wa.me/${phoneForWhatsApp(whatsappNumber)}?text=${encodeURIComponent(`Hello ${showground.name} team,\n\n${String(message).trim()}\n\nPlot: ${plotId}\nCustomer phone: ${phone}`)}` : ''
  res.status(201).json({ ok: true, inquiry: { id: inquiry._id.toString(), status: inquiry.status }, whatsappNumber, whatsappUrl })
}))

app.get('/api/admin/dashboard', requireAdmin, asyncRoute(async (req, res) => {
  const [showgrounds, bookings, pendingBookings, visitors, pendingVisitors] = await Promise.all([
    Showground.countDocuments(groundScope(req.admin)),
    Booking.countDocuments(bookingScope(req.admin)),
    Booking.countDocuments({ ...bookingScope(req.admin), approvalStatus: 'pending' }),
    Visitor.countDocuments(visitorScope(req.admin)),
    Visitor.countDocuments({ ...visitorScope(req.admin), status: 'pending' })
  ])
  res.json({ metrics: { showgrounds, bookings, pendingBookings, visitors, pendingVisitors } })
}))

app.get('/api/admin/showgrounds', requireAdmin, asyncRoute(async (req, res) => {
  const showgrounds = await Showground.find(groundScope(req.admin)).sort({ county: 1 }).lean()
  res.json({ showgrounds })
}))

app.post('/api/admin/showgrounds', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const requestedId = slugify(req.body.id || req.body.name)
  if (!requestedId || !String(req.body.name || '').trim() || !String(req.body.county || '').trim()) throw httpError(400, 'Showground ID, name, and county are required.', 'VALIDATION_ERROR')
  const exists = await Showground.exists({ id: requestedId })
  if (exists) throw httpError(409, 'A showground with that ID already exists.', 'DUPLICATE_ID')
  const showground = await Showground.create({
    id: requestedId,
    name: String(req.body.name).trim(),
    county: String(req.body.county).trim(),
    lat: Number(req.body.lat || 0),
    lng: Number(req.body.lng || 0),
    whatsappNumber: cleanPhone(String(req.body.whatsappNumber || '')).slice(0, 20),
    season: req.body.season || {},
    plots: []
  })
  res.status(201).json({ showground })
}))

app.put('/api/admin/showgrounds/:id', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const { name, county, lat, lng, season, plots } = req.body
  if (!String(name || '').trim() || !String(county || '').trim()) throw httpError(400, 'Showground name and county are required.', 'VALIDATION_ERROR')
  const cleanPlots = Array.isArray(plots) ? plots.map((plot) => cleanPlot(plot)).filter((plot) => plot.id) : []
  const updated = await Showground.findOneAndUpdate(
    { id: req.params.id },
    { $set: { name: String(name).trim(), county: String(county).trim(), lat: Number(lat), lng: Number(lng), whatsappNumber: cleanPhone(String(req.body.whatsappNumber || '')).slice(0, 20), season, plots: cleanPlots } },
    { new: true, runValidators: true }
  ).lean()
  if (!updated) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  res.json({ showground: updated })
}))

app.delete('/api/admin/showgrounds/:id', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const activeBooking = await Booking.exists({ showgroundId: req.params.id, status: { $nin: ['expired', 'failed', 'cancelled'] } })
  if (activeBooking) throw httpError(409, 'This showground has active bookings and cannot be deleted.', 'SHOWGROUND_IN_USE')
  const deleted = await Showground.findOneAndDelete({ id: req.params.id })
  if (!deleted) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  await Visitor.deleteMany({ showgroundId: req.params.id })
  res.json({ ok: true, id: req.params.id })
}))

app.post('/api/admin/showgrounds/:id/plots', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const plot = cleanPlot(req.body)
  if (!plot.id) throw httpError(400, 'Plot ID is required.', 'VALIDATION_ERROR')
  const updated = await Showground.findOneAndUpdate(
    { id: req.params.id, 'plots.id': { $ne: plot.id } },
    { $push: { plots: plot } },
    { new: true, runValidators: true }
  ).lean()
  if (!updated) {
    const ground = await Showground.exists({ id: req.params.id })
    throw httpError(ground ? 409 : 404, ground ? 'That plot ID already exists.' : 'Showground not found.', ground ? 'DUPLICATE_PLOT' : 'NOT_FOUND')
  }
  res.status(201).json({ showground: updated })
}))

app.put('/api/admin/showgrounds/:id/plots/:plotId', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const plot = cleanPlot({ ...req.body, id: req.params.plotId }, req.params.plotId)
  const updated = await Showground.findOneAndUpdate(
    { id: req.params.id, 'plots.id': req.params.plotId },
    { $set: { 'plots.$': plot } },
    { new: true, runValidators: true }
  ).lean()
  if (!updated) throw httpError(404, 'Showground or plot not found.', 'NOT_FOUND')
  res.json({ showground: updated })
}))

app.delete('/api/admin/showgrounds/:id/plots/:plotId', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const activeBooking = await Booking.exists({ showgroundId: req.params.id, plotId: req.params.plotId, status: { $nin: ['expired', 'failed', 'cancelled'] } })
  if (activeBooking) throw httpError(409, 'This plot has an active booking and cannot be deleted.', 'PLOT_IN_USE')
  const updated = await Showground.findOneAndUpdate({ id: req.params.id }, { $pull: { plots: { id: req.params.plotId } } }, { new: true }).lean()
  if (!updated) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  res.json({ showground: updated })
}))

// --- Plot digitization: boundaries, GeoJSON import, and a georeferenced site plan image ---

app.put('/api/admin/showgrounds/:id/plots/:plotId/boundary', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const showground = await Showground.findOne({ id: req.params.id })
  if (!showground) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  const plot = showground.plots.find((item) => item.id === req.params.plotId)
  if (!plot) throw httpError(404, 'Plot not found.', 'NOT_FOUND')
  if (req.body.boundary === null) {
    plot.boundary = undefined
  } else {
    const boundary = cleanBoundary(req.body.boundary)
    if (!boundary) throw httpError(400, 'A plot boundary needs at least 3 distinct points.', 'INVALID_BOUNDARY')
    plot.boundary = boundary
  }
  await showground.save()
  const updated = await Showground.findOne({ id: req.params.id }).lean()
  const savedPlot = updated.plots.find((item) => item.id === req.params.plotId)
  const overlaps = savedPlot?.boundary ? findOverlaps(updated.plots, req.params.plotId, savedPlot.boundary) : []
  res.json({ showground: updated, overlaps })
}))

// Bulk-import plot boundaries from a GeoJSON FeatureCollection (or a bare
// array of Polygon features). Each feature is matched to an existing plot by
// its `id`/`plotId` property; unmatched IDs and any resulting overlaps are
// reported back rather than silently dropped or blocked.
app.post('/api/admin/showgrounds/:id/geojson', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const showground = await Showground.findOne({ id: req.params.id })
  if (!showground) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  const source = req.body.geojson
  const features = Array.isArray(source?.features) ? source.features : Array.isArray(source) ? source : []
  if (!features.length) throw httpError(400, 'No polygon features were found in that file.', 'VALIDATION_ERROR')
  const matched = []
  const unmatched = []
  for (const feature of features) {
    const geometry = feature?.geometry?.type ? feature.geometry : feature
    if (geometry?.type !== 'Polygon') continue
    const plotId = String(feature?.properties?.id ?? feature?.properties?.plotId ?? feature?.id ?? '').trim()
    const boundary = cleanBoundary(geometry)
    if (!boundary) continue
    if (!plotId) { unmatched.push('(feature without an id)'); continue }
    const plot = showground.plots.find((item) => item.id === plotId)
    if (!plot) { unmatched.push(plotId); continue }
    plot.boundary = boundary
    matched.push(plotId)
  }
  if (!matched.length) throw httpError(400, 'None of the polygon IDs in that file matched an existing plot ID in this showground. Plot IDs must match exactly, e.g. "A-01".', 'NO_MATCHES')
  await showground.save()
  const updated = await Showground.findOne({ id: req.params.id }).lean()
  const overlaps = {}
  for (const plotId of matched) {
    const plot = updated.plots.find((item) => item.id === plotId)
    const found = plot?.boundary ? findOverlaps(updated.plots, plotId, plot.boundary) : []
    if (found.length) overlaps[plotId] = found
  }
  res.json({ showground: updated, matched, unmatched, overlaps })
}))

app.put('/api/admin/showgrounds/:id/site-plan', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const imageUrl = String(req.body.imageUrl || '').trim()
  if (!imageUrl) throw httpError(400, 'A site-plan image is required.', 'VALIDATION_ERROR')
  if (imageUrl.length > 6000000) throw httpError(413, 'The site-plan image is too large. Use an image under 4 MB.', 'IMAGE_TOO_LARGE')
  const bounds = req.body.bounds || {}
  const [south, west, north, east] = ['south', 'west', 'north', 'east'].map((key) => Number(bounds[key]))
  if (![south, west, north, east].every(Number.isFinite)) throw httpError(400, 'Provide numeric south/west/north/east bounds for the image.', 'VALIDATION_ERROR')
  if (south >= north || west >= east) throw httpError(400, 'The south-west corner must sit below and to the left of the north-east corner.', 'VALIDATION_ERROR')
  const opacity = Math.min(1, Math.max(0.2, Number(req.body.opacity) || 0.85))
  const updated = await Showground.findOneAndUpdate(
    { id: req.params.id },
    { $set: { sitePlan: { imageUrl, bounds: { south, west, north, east }, opacity } } },
    { new: true, runValidators: true }
  ).lean()
  if (!updated) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  res.json({ showground: updated })
}))

app.delete('/api/admin/showgrounds/:id/site-plan', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const updated = await Showground.findOneAndUpdate({ id: req.params.id }, { $unset: { sitePlan: 1 } }, { new: true }).lean()
  if (!updated) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  res.json({ showground: updated })
}))

app.get('/api/admin/bookings', requireAdmin, asyncRoute(async (req, res) => {
  const filter = ['pending', 'approved', 'rejected'].includes(req.query.approvalStatus) ? { approvalStatus: req.query.approvalStatus } : {}
  Object.assign(filter, bookingScope(req.admin))
  const bookings = await Booking.find(filter).sort({ createdAt: -1 }).limit(200).lean()
  res.json({ bookings: bookings.map((booking) => ({ ...publicBooking(booking), approvalStatus: booking.approvalStatus || 'approved' })) })
}))

app.patch('/api/admin/bookings/:id/approval', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const approvalStatus = String(req.body.approvalStatus || '')
  if (!['pending', 'approved', 'rejected'].includes(approvalStatus)) throw httpError(400, 'Choose pending, approved, or rejected.', 'VALIDATION_ERROR')
  const booking = await Booking.findById(req.params.id)
  if (!booking) throw httpError(404, 'Booking not found.', 'NOT_FOUND')
  if (approvalStatus === 'rejected' && ['confirmed', 'cancelled'].includes(booking.status)) throw httpError(409, 'A confirmed or cancelled booking cannot be rejected.', 'BOOKING_LOCKED')
  booking.approvalStatus = approvalStatus
  booking.approvalNote = String(req.body.approvalNote || '').trim().slice(0, 500)
  if (approvalStatus === 'pending') {
    booking.approvedAt = undefined
    booking.approvedBy = undefined
  } else {
    booking.approvedAt = new Date()
    booking.approvedBy = req.admin._id
  }
  if (approvalStatus === 'rejected') {
    booking.status = 'cancelled'
    await releasePlot(booking)
  }
  await booking.save()
  res.json({ booking: publicBooking(booking) })
}))

app.get('/api/admin/visitors', requireAdmin, asyncRoute(async (req, res) => {
  const filter = ['pending', 'approved', 'rejected', 'checked_in', 'checked_out'].includes(req.query.status) ? { status: req.query.status } : {}
  Object.assign(filter, visitorScope(req.admin))
  const visitors = await Visitor.find(filter).sort({ visitDate: 1, createdAt: -1 }).limit(300).lean()
  res.json({ visitors: visitors.map(publicVisitor) })
}))

app.post('/api/admin/visitors', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const fullName = String(req.body.fullName || '').trim()
  const visitDate = String(req.body.visitDate || '').trim()
  const showgroundId = String(req.body.showgroundId || '').trim()
  if (!fullName || !visitDate || !showgroundId) throw httpError(400, 'Visitor name, showground, and visit date are required.', 'VALIDATION_ERROR')
  if (!await Showground.exists({ id: showgroundId })) throw httpError(404, 'Showground not found.', 'NOT_FOUND')
  const visitor = await Visitor.create({
    showgroundId,
    fullName,
    phone: cleanPhone(req.body.phone || ''),
    permitRef: String(req.body.permitRef || '').trim(),
    visitDate,
    note: String(req.body.note || '').trim().slice(0, 500)
  })
  res.status(201).json({ visitor: publicVisitor(visitor) })
}))

app.patch('/api/admin/visitors/:id/approval', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const status = String(req.body.status || '')
  if (!['approved', 'rejected', 'pending'].includes(status)) throw httpError(400, 'Choose pending, approved, or rejected.', 'VALIDATION_ERROR')
  const update = { $set: { status } }
  if (status === 'pending') update.$unset = { approvedAt: 1, approvedBy: 1 }
  else Object.assign(update.$set, { approvedAt: new Date(), approvedBy: req.admin._id })
  const visitor = await Visitor.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
  if (!visitor) throw httpError(404, 'Visitor not found.', 'NOT_FOUND')
  res.json({ visitor: publicVisitor(visitor) })
}))

app.post('/api/admin/visitors/scan', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const permitRef = String(req.body.permitRef || '').trim()
  const visitorId = String(req.body.visitorId || '').trim()
  const action = req.body.action === 'check_out' ? 'check_out' : 'check_in'
  let visitor = visitorId && mongoose.isValidObjectId(visitorId) ? await Visitor.findById(visitorId) : null
  if (!visitor && permitRef) visitor = await Visitor.findOne({ permitRef }).sort({ createdAt: -1 })
  if (!visitor && permitRef) {
    const booking = await Booking.findOne({ permitRef, status: 'confirmed' }).lean()
    if (!booking) throw httpError(404, 'No confirmed permit was found for that QR code.', 'PERMIT_NOT_FOUND')
    visitor = await Visitor.create({
      fullName: booking.exhibitorName,
      phone: booking.phone,
      permitRef,
      showgroundId: booking.showgroundId,
      visitDate: new Date().toISOString().slice(0, 10),
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: req.admin._id
    })
  }
  if (!visitor) throw httpError(404, 'Visitor or permit not found.', 'VISITOR_NOT_FOUND')
  if (action === 'check_in' && visitor.status === 'rejected') throw httpError(409, 'This visitor is not approved for entry.', 'VISITOR_REJECTED')
  visitor.status = action === 'check_in' ? 'checked_in' : 'checked_out'
  visitor.lastScannedAt = new Date()
  visitor.scanEvents.push({ action, scannedAt: visitor.lastScannedAt, scannedBy: req.admin._id })
  await visitor.save()
  res.json({ visitor: publicVisitor(visitor), message: action === 'check_in' ? 'Visitor checked in.' : 'Visitor checked out.' })
}))

app.get('/api/admin/settings', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const settings = await SiteSettings.findOne({ key: 'primary' }).lean()
  res.json({ settings: settings || defaultPublicSettings })
}))

app.put('/api/admin/settings', requireAdmin, requireSuperAdmin, asyncRoute(async (req, res) => {
  const siteName = String(req.body.siteName ?? 'County Showgrounds').trim().slice(0, 120)
  const logoUrl = String(req.body.logoUrl ?? '/county-showgrounds-logo.png').trim()
  if (logoUrl.length > 700000) throw httpError(413, 'The logo file is too large. Use an image under 500 KB.', 'LOGO_TOO_LARGE')
  const requestedTheme = req.body.themeColors || {}
  const themeColors = Object.fromEntries(Object.entries(defaultThemeColors).map(([key, fallback]) => [key, isHexColor(requestedTheme[key]) ? requestedTheme[key] : fallback]))
  const settings = await SiteSettings.findOne({ key: 'primary' }) || new SiteSettings({ key: 'primary' })
  settings.siteName = siteName || 'County Showgrounds'
  settings.logoUrl = logoUrl
  settings.supportPhone = String(req.body.supportPhone ?? '').trim().slice(0, 30)
  settings.themeColors = themeColors
  settings.updatedBy = req.admin._id
  await settings.save()
  res.json({ settings: settings.toObject() })
}))

app.use((error, req, res, next) => {
  console.error(error)
  const status = error.status || (error.code === 11000 ? 409 : error.name === 'ValidationError' ? 400 : 500)
  const message = error.code === 11000 ? 'An account with that email already exists.' : error.message
  res.status(status).json({ error: status >= 500 ? 'The server could not complete that request.' : message, code: error.code === 11000 ? 'DUPLICATE_EMAIL' : error.code || 'SERVER_ERROR' })
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
    await ensureAdminUser()
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
