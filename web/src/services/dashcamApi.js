import {
  CAMERA_HOSTS,
  CGI,
  PAIR_KEY,
  POLL_MS,
  RELAY_ORIGIN,
  RELAY_PATH,
  RTSP_PATHS,
  STATUS_SOURCE,
} from '../config/dashcam'
import { buildStatus } from './dashcamProtocol'
import { storage } from './storage'
import { isNative } from './platform'

/**
 * Reading Dash Cam Pro+ status.
 *
 * Two routes, because one alone cannot cover both cases the owner has:
 *
 *   direct — the phone is joined to the camera's Wi-Fi. Fastest and needs no
 *            server, but the page must itself be on plain HTTP, since a
 *            browser on HTTPS refuses to call an HTTP address.
 *   relay  — the car-side bridge posts status to this app's own origin, and
 *            any device reads it back. Works from anywhere, and is the only
 *            route available to the installed PWA.
 *
 * `read()` prefers the relay when the page is secure, because direct would be
 * blocked anyway, and falls back to direct otherwise.
 */

const TIMEOUT_MS = 4000

/** fetch with a deadline — a camera out of range hangs rather than refusing. */
async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Where to call the relay from here.
 *
 * Relative in a browser, so the page talks to the relay it was served from
 * and a preview deployment does not read production's status. Absolute in the
 * Android app, where the page's own origin is `https://localhost` and a
 * relative path would resolve to nothing.
 */
export function relayUrl() {
  return isNative() ? `${RELAY_ORIGIN}${RELAY_PATH}` : RELAY_PATH
}

/**
 * Can this client reach the camera's plain-HTTP address directly?
 *
 * A browser on an HTTPS page cannot: mixed content is blocked, and no amount
 * of permission changes that. The Android app is also served over HTTPS
 * (`https://localhost`), but its WebView is configured to allow cleartext to
 * local addresses — so the same protocol check that is correct in a browser
 * is exactly wrong there, and would hide the live-view and record controls on
 * the one device that can actually use them.
 */
export function isDirectBlocked() {
  if (typeof window === 'undefined') return false
  if (isNative()) return false
  return window.location?.protocol === 'https:'
}

/** Which route `read()` will take, so the UI can explain itself. */
export function preferredSource() {
  return isDirectBlocked() ? STATUS_SOURCE.relay : STATUS_SOURCE.direct
}

/** rtsp:// URLs for the live view — for handing to an external player. */
export function streamUrls(host = CAMERA_HOSTS[0]) {
  return RTSP_PATHS.map((path) => `rtsp://${host}/${path}`)
}

async function getText(host, cgi) {
  const res = await fetchWithTimeout(`http://${host}/${cgi}`)
  if (!res.ok) throw new Error(`${cgi} -> HTTP ${res.status}`)
  return res.text()
}

/**
 * Talk to the camera on the local network.
 *
 * Each reply is fetched independently and a failure is tolerated: older
 * firmware omits some of these CGIs entirely, and losing the SD reply should
 * still leave a usable "it is recording" answer.
 *
 * @param {string} [host] skip the probe when the address is already known
 * @returns {Promise<object>} status, shaped by buildStatus
 */
export async function readDirect(host) {
  const hosts = host ? [host] : CAMERA_HOSTS
  let lastError

  for (const candidate of hosts) {
    try {
      // Cheapest call first: if this fails the camera is not there, and
      // there is no point waiting out a timeout on four more requests.
      const deviceAttr = await getText(candidate, CGI.deviceAttr)

      const [workState, sdStatus, wifi] = await Promise.all(
        [CGI.workState, CGI.sdStatus, CGI.wifi].map((cgi) =>
          getText(candidate, cgi).catch(() => ''),
        ),
      )

      return {
        ...buildStatus({ deviceAttr, workState, sdStatus, wifi }),
        host: candidate,
        source: STATUS_SOURCE.direct,
      }
    } catch (err) {
      lastError = err
    }
  }

  throw lastError ?? new Error('No camera found on the local network')
}

/**
 * Raised when the relay will not answer without a pairing code, so callers
 * can prompt for one instead of reporting the camera as offline.
 */
export class PairingRequiredError extends Error {
  constructor(message = 'This device is not paired yet') {
    super(message)
    this.name = 'PairingRequiredError'
  }
}

/**
 * The pairing code held on this device, if it has been paired.
 * @returns {Promise<string>} '' when unpaired
 */
export async function getPairCode() {
  return (await storage.getItem(PAIR_KEY)) || ''
}

/**
 * Remember a pairing code on this device.
 *
 * Verified against the relay before being stored, so a typo is reported at
 * the moment it is made rather than surfacing later as "camera offline".
 *
 * @param {string} code
 * @returns {Promise<void>}
 * @throws when the relay rejects the code
 */
export async function pair(code) {
  const trimmed = String(code ?? '').trim()
  if (!trimmed) throw new Error('Enter the pairing code')

  const res = await fetchWithTimeout(relayUrl(), {
    headers: { 'x-dashcam-pair': trimmed },
  })

  if (res.status === 401 || res.status === 403) {
    throw new Error('That code was not accepted')
  }
  // 404 means paired correctly but nothing has reported yet — still a valid
  // code, and refusing it here would block pairing before the first drive.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Could not reach the relay (HTTP ${res.status})`)
  }

  await storage.setItem(PAIR_KEY, trimmed)
}

/** Forget this device's pairing code. */
export async function unpair() {
  await storage.removeItem(PAIR_KEY)
}

/**
 * Read the last status the car-side bridge posted.
 * @returns {Promise<object|null>} null when the bridge has never reported
 * @throws {PairingRequiredError} when this device has no accepted code
 */
export async function readRelay() {
  const code = await getPairCode()
  const res = await fetchWithTimeout(
    relayUrl(),
    code ? { headers: { 'x-dashcam-pair': code } } : undefined,
  )

  if (res.status === 401 || res.status === 403) {
    // A stored code that stopped working is worse than none: it would retry
    // silently forever. Drop it so the screen asks again.
    if (code) await unpair()
    throw new PairingRequiredError()
  }
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Relay -> HTTP ${res.status}`)

  const body = await res.json()
  if (!body || !body.status) return null
  return { ...body.status, source: STATUS_SOURCE.relay }
}

/**
 * Read status by whichever route can work from here.
 * @returns {Promise<object|null>}
 * @throws {PairingRequiredError} when only the relay is usable and this
 *   device has no accepted code
 */
export async function read() {
  if (isDirectBlocked()) return readRelay()

  try {
    return await readDirect()
  } catch {
    // Not on the camera's Wi-Fi — the bridge may still know. A pairing error
    // from here is deliberately allowed to propagate: swallowing it into
    // "offline" would mean the screen never asks for a code.
    return readRelay()
  }
}

/**
 * Start or stop a recording. Direct only: the relay is a letterbox, not a
 * tunnel, so commands cannot be sent from another network.
 *
 * @param {'start'|'stop'|'trigger'} action
 * @param {string} [host]
 */
export async function command(action, host) {
  const cgi = {
    start: CGI.recordStart,
    stop: CGI.recordStop,
    trigger: CGI.recordTrigger,
  }[action]
  if (!cgi) throw new Error(`Unknown camera command: ${action}`)
  if (isDirectBlocked()) throw new Error('Commands need the camera’s own Wi-Fi')

  const hosts = host ? [host] : CAMERA_HOSTS
  let lastError
  for (const candidate of hosts) {
    try {
      await getText(candidate, cgi)
      return
    } catch (err) {
      lastError = err
    }
  }
  throw lastError ?? new Error('Camera did not answer')
}

export { POLL_MS }
