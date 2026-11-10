/**
 * Telegram upload credentials for paired Ambiance devices.
 *
 * Clips are uploaded by the phones themselves (Vercel cannot accept a 50 MB
 * video body), so each paired device needs the bot token and the destination
 * chat. That is a deliberate trade: this is a single-owner app, the token is
 * only handed out after the pairing code is checked, and the alternative —
 * proxying every byte through the relay — cannot work on serverless.
 *
 * The destination is a private Telegram channel (or Saved Messages via a
 * user id). Telegram Drive opens that same channel as a folder, which is how
 * "store in Telegram Drive" is achieved without embedding Telegram Drive.
 *
 * Environment:
 *   DASHCAM_PAIR_CODE
 *   TELEGRAM_BOT_TOKEN   from @BotFather
 *   TELEGRAM_CHAT_ID     channel id (e.g. -100…) or numeric user id
 */
import { applyCors, isPaired } from './_dashcam.js'

export default async function handler(req, res) {
  applyCors(res)

  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isPaired(req)) {
    return res.status(401).json({ error: 'This device is not paired' })
  }

  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim()

  if (!token || !chatId) {
    return res.status(503).json({
      error: 'Telegram upload is not configured on the server yet',
      configured: false,
    })
  }

  return res.status(200).json({
    configured: true,
    botToken: token,
    chatId,
    // Public Bot API hard cap. Stay under this so multipart overhead still
    // fits; see research notes in dashcamUpload.js.
    maxBytes: 49 * 1024 * 1024,
  })
}
