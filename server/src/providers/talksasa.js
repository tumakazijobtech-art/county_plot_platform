import { config } from '../config.js'

export async function sendSms({ phone, message }) {
  if (config.demoMode) return { demo: true, accepted: true }
  if (!config.talkSasa.apiKey || !config.talkSasa.apiUrl) throw new Error('Talk Sasa is not configured')
  const response = await fetch(config.talkSasa.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.talkSasa.apiKey}`
    },
    body: JSON.stringify({
      to: phone,
      message,
      sender_id: config.talkSasa.senderId
    })
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Talk Sasa rejected the SMS (${response.status})`)
  return body
}
