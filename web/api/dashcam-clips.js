/**
 * Shared ledger of dashcam clips that have been uploaded to Telegram.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every phone with Ambiance can pull clips off the camera and push them to
 * Telegram when it has internet. Without a shared record, two phones that
 * both rode in the car would each upload the same clip, burning twice the
 * mobile data and leaving duplicates in Telegram Drive.
 *
 * This endpoint is that record. A device claims a clip before uploading,
 * confirms after Telegram accepts it, and releases the claim if the upload
 * fails so another device can try.
 *
 * Environment:
 *   DASHCAM_PAIR_CODE      required for every call
 *   BLOB_READ_WRITE_TOKEN  enables durable storage across cold starts
 */
import {
  applyCors,
  hasBlob,
  isPaired,
  loadJson,
  saveJson,
} from './_dashcam.js'

const KEY = 'dashcam-clips.json'

/** A claim older than this is treated as abandoned. */
const CLAIM_TTL_MS = 30 * 60 * 1000

const MAX_BODY_BYTES = 16 * 1024

/** In-memory fallback when no Blob store is linked. */
const memory = { value: null }

function emptyLedger() {
  return { clips: {}, updatedAt: Date.now() }
}

async function loadLedger() {
  try {
    const data = await loadJson(KEY, memory)
    if (!data || typeof data !== 'object' || typeof data.clips !== 'object') {
      return emptyLedger()
    }
    return data
  } catch (err) {
    if (err?.name === 'BlobNotFoundError' || err?.status === 404) {
      return emptyLedger()
    }
    throw err
  }
}

async function saveLedger(ledger) {
  ledger.updatedAt = Date.now()
  await saveJson(KEY, ledger, memory)
}

/**
 * Filename is the identity. Camera firmware names are unique on the card
 * (they embed a timestamp), and the size is often unknown until after a
 * download — keying on size would split one clip into two ledger rows.
 */
function clipKey(name) {
  return String(name || '').trim().toLowerCase()
}

function publicClip(entry) {
  if (!entry) return null
  return {
    name: entry.name,
    size: entry.size,
    state: entry.state,
    uploadedAt: entry.uploadedAt,
    claimedAt: entry.claimedAt,
    claimedBy: entry.claimedBy,
    messageId: entry.messageId,
    telegramFileId: entry.telegramFileId,
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }

  let raw = ''
  if (typeof req.body === 'string') raw = req.body
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8')
  else {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Too large'), { code: 413 })
      chunks.push(chunk)
    }
    raw = Buffer.concat(chunks).toString('utf8')
  }

  if (!raw.trim()) return null
  try {
    return JSON.parse(raw)
  } catch {
    throw Object.assign(new Error('Body is not JSON'), { code: 400 })
  }
}

function expireStaleClaims(ledger, now) {
  for (const [key, entry] of Object.entries(ledger.clips)) {
    if (entry.state !== 'claimed') continue
    if (now - (entry.claimedAt || 0) > CLAIM_TTL_MS) {
      // Back to pending so another device can pick it up. Do not delete —
      // the local queue on the claiming device may still finish and confirm.
      entry.state = 'pending'
      delete entry.claimedBy
      delete entry.claimedAt
    }
  }
}

export default async function handler(req, res) {
  applyCors(res)

  if (req.method === 'OPTIONS') return res.status(204).end()

  if (!isPaired(req)) {
    return res.status(401).json({ error: 'This device is not paired' })
  }

  if (req.method === 'GET') {
    try {
      const ledger = await loadLedger()
      expireStaleClaims(ledger, Date.now())
      const clips = Object.values(ledger.clips)
        .map(publicClip)
        .filter(Boolean)
        .sort((a, b) => (b.uploadedAt || b.claimedAt || 0) - (a.uploadedAt || a.claimedAt || 0))
      return res.status(200).json({ clips, durable: hasBlob() })
    } catch (err) {
      return res.status(502).json({ error: String(err?.message ?? err) })
    }
  }

  if (req.method === 'POST') {
    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return res.status(err?.code === 413 ? 413 : 400).json({ error: String(err.message) })
    }

    const action = String(body?.action || '').trim()
    const name = String(body?.name || '').trim()
    const size = Number(body?.size)
    const deviceId = String(body?.deviceId || req.headers['x-dashcam-device'] || '').trim()

    if (!name) {
      return res.status(400).json({ error: 'name is required' })
    }
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' })
    }
    if (!['claim', 'confirm', 'release', 'skip'].includes(action)) {
      return res.status(400).json({ error: 'Unknown action' })
    }

    try {
      const ledger = await loadLedger()
      const now = Date.now()
      expireStaleClaims(ledger, now)
      const key = clipKey(name)
      const existing = ledger.clips[key]
      const resolvedSize =
        Number.isFinite(size) && size > 0 ? size : Number(existing?.size) || 0

      if (action === 'claim') {
        if (existing?.state === 'uploaded') {
          return res.status(200).json({ ok: true, clip: publicClip(existing), already: true })
        }
        if (
          existing?.state === 'claimed' &&
          existing.claimedBy &&
          existing.claimedBy !== deviceId &&
          now - (existing.claimedAt || 0) < CLAIM_TTL_MS
        ) {
          return res.status(409).json({
            error: 'Another device is uploading this clip',
            clip: publicClip(existing),
          })
        }
        ledger.clips[key] = {
          name,
          size: resolvedSize,
          state: 'claimed',
          claimedBy: deviceId,
          claimedAt: now,
        }
        await saveLedger(ledger)
        return res.status(200).json({ ok: true, clip: publicClip(ledger.clips[key]) })
      }

      if (action === 'confirm') {
        if (existing?.state === 'uploaded') {
          return res.status(200).json({ ok: true, clip: publicClip(existing), already: true })
        }
        if (existing?.state === 'claimed' && existing.claimedBy && existing.claimedBy !== deviceId) {
          return res.status(409).json({ error: 'Claim held by another device' })
        }
        ledger.clips[key] = {
          name,
          size: resolvedSize,
          state: 'uploaded',
          uploadedAt: now,
          uploadedBy: deviceId,
          messageId: body?.messageId ?? existing?.messageId,
          telegramFileId: body?.telegramFileId ?? existing?.telegramFileId,
        }
        await saveLedger(ledger)
        return res.status(200).json({ ok: true, clip: publicClip(ledger.clips[key]) })
      }

      if (action === 'release') {
        if (existing?.state === 'uploaded') {
          return res.status(200).json({ ok: true, clip: publicClip(existing) })
        }
        if (existing?.claimedBy && existing.claimedBy !== deviceId) {
          return res.status(409).json({ error: 'Claim held by another device' })
        }
        if (existing) {
          existing.state = 'pending'
          delete existing.claimedBy
          delete existing.claimedAt
        }
        await saveLedger(ledger)
        return res.status(200).json({ ok: true, clip: publicClip(existing) })
      }

      if (action === 'skip') {
        // Too large for Bot API, permanently marked so every device stops
        // retrying. The owner can still pull it via Telegram Drive Folder Sync.
        ledger.clips[key] = {
          name,
          size: resolvedSize,
          state: 'skipped',
          skippedAt: now,
          reason: String(body?.reason || 'too_large').slice(0, 80),
          skippedBy: deviceId,
        }
        await saveLedger(ledger)
        return res.status(200).json({ ok: true, clip: publicClip(ledger.clips[key]) })
      }

      return res.status(400).json({ error: 'Unknown action' })
    } catch (err) {
      return res.status(502).json({ error: String(err?.message ?? err) })
    }
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS')
  return res.status(405).json({ error: 'Method not allowed' })
}
