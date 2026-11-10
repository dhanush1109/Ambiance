/**
 * Shared helpers for the dashcam serverless endpoints.
 *
 * Status, clip ledger and Telegram config all share the same pairing gate and
 * the same Blob-or-memory store pattern. Keeping the crypto and CORS here
 * means a change to how pairing works lands in one place.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { get, put } from '@vercel/blob'

export const ACCESS = 'private'

export const hasBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN)

/**
 * Compare two secrets without leaking length through timing.
 * Both sides are hashed first so the comparison is always over 32 bytes.
 */
export function tokenMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') return false
  if (!given || !expected) return false

  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** Pairing code from the request, or '' when absent. */
export function pairFrom(req) {
  return String(req.headers['x-dashcam-pair'] || '').trim()
}

/**
 * True when the request carries an accepted pairing code.
 *
 * When DASHCAM_PAIR_CODE is unset the gate is open — useful for a first
 * deploy before the code is configured, and never the production shape.
 */
export function isPaired(req) {
  const expected = (process.env.DASHCAM_PAIR_CODE || '').trim()
  if (!expected) return true
  return tokenMatches(pairFrom(req), expected)
}

/** CORS so the Android WebView at https://localhost can call these. */
export function applyCors(res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, content-type, x-dashcam-pair, x-dashcam-token, x-dashcam-device',
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Max-Age', '86400')
}

export async function loadJson(key, memorySlot) {
  if (!hasBlob()) return memorySlot.value

  const result = await get(key, { access: ACCESS, useCache: false })
  if (!result?.stream) return null
  return new Response(result.stream).json()
}

export async function saveJson(key, value, memorySlot) {
  if (!hasBlob()) {
    memorySlot.value = value
    return
  }

  await put(key, JSON.stringify(value), {
    access: ACCESS,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  })
}
