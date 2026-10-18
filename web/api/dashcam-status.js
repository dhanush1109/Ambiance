/**
 * Dash Cam Pro+ status relay.
 *
 * The camera is its own Wi-Fi access point. It answers plain HTTP CGI, it has
 * no internet route, and it never initiates anything — so nothing outside the
 * car can ask it anything. This endpoint is the letterbox that makes status
 * readable from any device: the car-side bridge POSTs what it sees, and the
 * app GETs the last thing posted.
 *
 * Deliberately not a tunnel. It carries a status snapshot in one direction
 * only — there is no path from here back to the camera, so a leaked URL
 * cannot be used to command the recorder or reach the footage.
 *
 * Storage: Vercel Blob when configured, so the reading survives the cold
 * starts that serverless functions take between requests. Without it the
 * value lives in the instance's memory and is lost on the next cold start —
 * usable for a quick trial, not for real use.
 *
 * Environment:
 *   DASHCAM_TOKEN          required to POST
 *   DASHCAM_PAIR_CODE      required to GET; the code entered on each device
 *   BLOB_READ_WRITE_TOKEN  set by linking a Blob store; enables persistence
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { get, put } from '@vercel/blob'

const KEY = 'dashcam-status.json'

/**
 * The store is private, so the object is not reachable by URL — reads go
 * through an authenticated server-side call. That is stricter than this data
 * needs (GET already hands the same sanitized view to anyone who asks), but
 * it means the stored copy is never independently fetchable.
 */
const ACCESS = 'private'

/** Reject oversized bodies outright rather than storing whatever arrives. */
const MAX_BODY_BYTES = 8 * 1024

/**
 * Last reading, when there is no Blob store configured. Survives only as long
 * as this instance does, which is why `durable` is reported in the response.
 */
let memory = null

const hasBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN)

async function loadStatus() {
  if (!hasBlob()) return memory

  // useCache: false — a cached status is the one thing this must never serve.
  const result = await get(KEY, { access: ACCESS, useCache: false })
  if (!result?.stream) return null

  return new Response(result.stream).json()
}

async function saveStatus(status) {
  if (!hasBlob()) {
    memory = status
    return
  }

  await put(KEY, JSON.stringify(status), {
    access: ACCESS,
    contentType: 'application/json',
    // One fixed pathname, overwritten in place, rather than a new object per
    // poll — otherwise a bridge polling all day would accumulate thousands of
    // blobs that nothing ever reads.
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })
}

/**
 * Compare two secrets without leaking anything through timing.
 *
 * Both sides are hashed first so the comparison is always over 32 bytes:
 * comparing the raw strings would need a length check up front, which tells
 * an attacker how long the real token is.
 */
function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false
  if (!given || !expected) return false

  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * What a reader is allowed to see.
 *
 * The response is built from an allow-list: whatever else the bridge posts
 * stays server-side. Serial number and MAC are the camera's identity and are
 * of no use on a status screen, so they never leave this function — even
 * though reads are now gated on a pairing code.
 */
function publicView(status) {
  if (!status || typeof status !== 'object') return null
  const sd = status.sd ?? {}
  const wifi = status.wifi ?? {}
  const device = status.device ?? {}

  const totalMb = Number.isFinite(sd.totalMb) ? sd.totalMb : undefined
  const freeMb = Number.isFinite(sd.freeMb) ? sd.freeMb : undefined

  // Derived here when absent, so the storage bar works even if the reporting
  // bridge only forwarded the raw sizes.
  let usedPct = Number.isFinite(sd.usedPct) ? sd.usedPct : undefined
  if (usedPct === undefined && totalMb && freeMb !== undefined && totalMb > 0) {
    usedPct = Math.round(((totalMb - freeMb) / totalMb) * 100)
  }
  if (usedPct !== undefined) usedPct = Math.max(0, Math.min(100, usedPct))

  return {
    online: Boolean(status.online),
    recording: typeof status.recording === 'boolean' ? status.recording : undefined,
    mode: typeof status.mode === 'string' ? status.mode.slice(0, 40) : undefined,
    parking: typeof status.parking === 'boolean' ? status.parking : undefined,
    sd: {
      present: typeof sd.present === 'boolean' ? sd.present : undefined,
      totalMb,
      freeMb,
      usedPct,
    },
    wifi: {
      ssid: typeof wifi.ssid === 'string' ? wifi.ssid.slice(0, 40) : undefined,
      channel: Number.isFinite(wifi.channel) ? wifi.channel : undefined,
    },
    device: {
      model: typeof device.model === 'string' ? device.model.slice(0, 40) : undefined,
      firmware: typeof device.firmware === 'string' ? device.firmware.slice(0, 40) : undefined,
    },
    // Stamped here, not by the bridge: a wrong clock in the car would
    // otherwise make a fresh reading look hours old, or permanently live.
    at: Number.isFinite(status.at) ? status.at : Date.now(),
  }
}

/**
 * Read the request body as an object.
 *
 * Does not rely on the runtime pre-parsing it: depending on how the function
 * is invoked, `req.body` arrives as an object, a string, a Buffer, or not at
 * all — so the raw stream is consumed when there is nothing usable already.
 * The byte cap is enforced while reading, so an oversized body is dropped
 * rather than buffered in full.
 */
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

  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    throw Object.assign(new Error('Too large'), { code: 413 })
  }
  if (!raw.trim()) return null

  try {
    return JSON.parse(raw)
  } catch {
    throw Object.assign(new Error('Body is not JSON'), { code: 400 })
  }
}

export default async function handler(req, res) {
  // The status readout must never be cached — a cached "Recording" is worse
  // than no answer, because it looks current.
  res.setHeader('Cache-Control', 'no-store')

  // The Android app's page is served from `https://localhost`, so its calls
  // here are cross-origin and the browser demands CORS headers before it will
  // hand the response to the app. The pairing code travels in a custom
  // header, which also forces a preflight — so OPTIONS has to be answered.
  //
  // `*` is safe precisely because the gate is a header, not a cookie: a
  // malicious page cannot borrow the user's credentials the way it could with
  // `credentials: 'include'`, and without the code it gets the same 401 as
  // anyone else.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-dashcam-pair, x-dashcam-token')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method === 'GET') {
    // Reading is gated on a shared pairing code. Status is not footage, but
    // "is this car recording, and when was it last active" is exactly what
    // someone casing a car would want, and an unpublished URL is not a
    // protection. Each device enters the code once and remembers it.
    const pairCode = (process.env.DASHCAM_PAIR_CODE || '').trim()
    if (pairCode) {
      const given = req.headers['x-dashcam-pair'] || ''
      if (!tokenMatches(String(given).trim(), pairCode)) {
        // 401 and not 404: the app has to tell "not paired" apart from
        // "nothing reported yet", or it cannot know to ask for a code.
        return res.status(401).json({ error: 'This device is not paired' })
      }
    }

    try {
      const status = await loadStatus()
      if (!status) {
        return res.status(404).json({ error: 'No status reported yet' })
      }
      return res.status(200).json({ status, durable: hasBlob() })
    } catch (err) {
      // Nothing stored yet reads as a missing object, which is a 404 here and
      // not a fault: the app shows "no camera found" and keeps polling.
      if (err?.name === 'BlobNotFoundError' || err?.status === 404) {
        return res.status(404).json({ error: 'No status reported yet' })
      }
      return res.status(502).json({ error: String(err?.message ?? err) })
    }
  }

  if (req.method === 'POST') {
    // Trimmed: this is set by hand in a dashboard or piped in from a shell,
    // and a stray newline on either side would silently reject every post.
    const expected = (process.env.DASHCAM_TOKEN || '').trim()
    if (!expected) {
      return res.status(503).json({ error: 'Relay has no DASHCAM_TOKEN configured' })
    }

    const given =
      (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      req.headers['x-dashcam-token'] ||
      ''
    if (!tokenMatches(String(given).trim(), expected)) {
      return res.status(401).json({ error: 'Bad token' })
    }

    let body
    try {
      body = await readBody(req)
    } catch (err) {
      return res.status(err?.code === 413 ? 413 : 400).json({ error: String(err.message) })
    }

    const status = publicView(body?.status ?? body)
    if (!status) return res.status(400).json({ error: 'No status in body' })

    try {
      await saveStatus(status)
      return res.status(200).json({ ok: true, durable: hasBlob() })
    } catch (err) {
      return res.status(502).json({ error: String(err?.message ?? err) })
    }
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS')
  return res.status(405).json({ error: 'Method not allowed' })
}
