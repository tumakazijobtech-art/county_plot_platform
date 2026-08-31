import { config } from '../config.js'

export async function sendSms({ phone, message }) {
  if (config.demoMode) return { demo: true, accepted: true }
  if (!config.talkSasa.apiKey || !config.talkSasa.apiUrl) throw new Error('Talk Sasa is not configured')
  const rawPhone = String(phone || '').replace(/\s+/g, '')
  const recipient = rawPhone.startsWith('+') ? rawPhone : rawPhone.startsWith('254') ? `+${rawPhone}` : `+254${rawPhone.replace(/^0/, '')}`
  const response = await fetch(config.talkSasa.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.talkSasa.apiKey}`
    },
    body: JSON.stringify({
      recipient,
      message,
      type: 'plain',
      sender_id: config.talkSasa.senderId
    })
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const reason = body.message || body.error || body.detail
    throw new Error(`Talk Sasa rejected the SMS (${response.status})${reason ? `: ${reason}` : ''}`)
  }
  return body
}
