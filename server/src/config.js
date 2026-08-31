import 'dotenv/config'

const asBoolean = (value, fallback = false) => value === undefined ? fallback : value.toLowerCase() === 'true'

export const config = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/county_plot_hub',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  appOrigin: process.env.APP_ORIGIN || process.env.CLIENT_ORIGIN?.split(',')[0]?.trim() || 'http://localhost:5173',
  demoMode: asBoolean(process.env.DEMO_MODE, true),
  bookingHoldMinutes: Number(process.env.BOOKING_HOLD_MINUTES || 20),
  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@countyshowgrounds.test').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
    name: process.env.ADMIN_NAME || 'County Showgrounds Admin'
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || 'brevo',
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.EMAIL_FROM || 'no-reply@countyshowgrounds.test',
    fromName: process.env.EMAIL_FROM_NAME || 'County Showgrounds'
  },
  mpesa: {
    environment: process.env.MPESA_ENV || 'sandbox',
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortCode: process.env.MPESA_SHORT_CODE,
    partyB: process.env.MPESA_PARTY_B,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
    transactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline'
  },
  talkSasa: {
    apiKey: process.env.TALKSASA_API_KEY,
    senderId: process.env.TALKSASA_SENDER_ID || 'COUNTYHUB',
    apiUrl: process.env.TALKSASA_API_URL || 'https://bulksms.talksasa.com/api/v3/sms/send'
  }
}

export function assertProductionConfig() {
  if (config.demoMode) return
  const missing = [
    ['MONGODB_URI', config.mongoUri],
    ['MPESA_CONSUMER_KEY', config.mpesa.consumerKey],
    ['MPESA_CONSUMER_SECRET', config.mpesa.consumerSecret],
    ['MPESA_SHORT_CODE', config.mpesa.shortCode],
    ['MPESA_PARTY_B', config.mpesa.partyB],
    ['MPESA_PASSKEY', config.mpesa.passkey],
    ['MPESA_CALLBACK_URL', config.mpesa.callbackUrl],
    ['TALKSASA_API_KEY', config.talkSasa.apiKey],
    ['TALKSASA_API_URL', config.talkSasa.apiUrl]
  ].filter(([, value]) => !value)
  if (missing.length) throw new Error(`Missing production environment variables: ${missing.map(([key]) => key).join(', ')}`)
}
