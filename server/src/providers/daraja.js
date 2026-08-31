import { config } from '../config.js'

const baseUrl = config.mpesa.environment === 'live'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke'

function mpesaPhone(phone) {
  const compact = phone.replace(/\s+/g, '')
  if (compact.startsWith('+254')) return compact.slice(1)
  if (compact.startsWith('0')) return `254${compact.slice(1)}`
  return compact
}

function timestamp() {
  const date = new Date()
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ]
  return parts.join('')
}

async function getAccessToken() {
  const credentials = Buffer.from(`${config.mpesa.consumerKey}:${config.mpesa.consumerSecret}`).toString('base64')
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || !body.access_token) throw new Error('Daraja access token request failed')
  return body.access_token
}

export async function initiateStkPush({ phone, amount, accountReference, description }) {
  if (!config.mpesa.shortCode || !config.mpesa.partyB || !config.mpesa.passkey || !config.mpesa.callbackUrl) {
    throw new Error('Daraja shortcode, PartyB, passkey, and callback URL are required')
  }
  const time = timestamp()
  const password = Buffer.from(`${config.mpesa.shortCode}${config.mpesa.passkey}${time}`).toString('base64')
  const token = await getAccessToken()
  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: config.mpesa.shortCode,
      Password: password,
      Timestamp: time,
      TransactionType: config.mpesa.transactionType,
      Amount: Math.round(amount),
      PartyA: mpesaPhone(phone),
      PartyB: config.mpesa.partyB,
      PhoneNumber: mpesaPhone(phone),
      CallBackURL: config.mpesa.callbackUrl,
      AccountReference: accountReference.slice(0, 12),
      TransactionDesc: description.slice(0, 50)
    })
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.ResponseCode !== '0') throw new Error(body.errorMessage || body.ResponseDescription || 'Daraja STK Push failed')
  return body
}
