/**
 * Parsers for the camera's CGI replies.
 *
 * The firmware answers in a flat `key=value` / `-name=value` text form rather
 * than JSON, so every reader is tolerant: unknown keys are ignored, missing
 * keys come back undefined, and a malformed body yields an empty object
 * instead of throwing. A dashcam on a weak link truncates replies, and a
 * thrown parse error would read as "camera offline" when it is merely noisy.
 *
 * Pure functions, no I/O — so the bridge and the app can share them and the
 * tests can feed them captured strings.
 */

/**
 * Split a CGI body into a plain object.
 *
 * Accepts the shapes the firmware actually emits:
 *   `key=value` per line, `-key=value`, and `key:value`.
 *
 * @param {string} body
 * @returns {Record<string, string>}
 */
export function parseCgi(body) {
  if (typeof body !== 'string' || !body) return {}
  const out = {}
  for (const rawLine of body.split(/[\r\n&]+/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = /^-?([A-Za-z0-9_.-]+)\s*[=:]\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, value] = match
    out[key.toLowerCase()] = value.trim()
  }
  return out
}

/** First present key, as a trimmed string. */
function pick(map, keys) {
  for (const key of keys) {
    const value = map[key]
    if (value !== undefined && value !== '') return value
  }
  return undefined
}

/** Firmware uses 1/0, "on"/"off", "true", "yes" interchangeably. */
function asBool(value) {
  if (value === undefined) return undefined
  return /^(1|on|true|yes|recording|start(ed)?)$/i.test(String(value).trim())
}

function asInt(value) {
  if (value === undefined) return undefined
  const n = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : undefined
}

/**
 * `getdeviceattr.cgi` — who the camera says it is.
 * @returns {{model?: string, firmware?: string, serial?: string, mac?: string}}
 */
export function parseDeviceAttr(body) {
  const map = parseCgi(body)
  return {
    model: pick(map, ['model', 'product', 'devicename', 'name', 'brand']),
    firmware: pick(map, ['firmware', 'version', 'fwversion', 'softversion']),
    serial: pick(map, ['serial', 'sn', 'serialno', 'deviceid']),
    mac: pick(map, ['mac', 'macaddr', 'wifimac']),
  }
}

/**
 * `getworkstate.cgi` — what the camera is doing right now.
 * @returns {{recording?: boolean, mode?: string, parking?: boolean}}
 */
export function parseWorkState(body) {
  const map = parseCgi(body)
  const mode = pick(map, ['workmode', 'mode', 'state', 'workstate'])
  const explicit = asBool(pick(map, ['recording', 'record', 'isrecording', 'rec']))
  return {
    // Some builds only report a mode string; "record" in it means recording.
    recording: explicit !== undefined ? explicit : mode ? /rec/i.test(mode) : undefined,
    mode,
    parking: asBool(pick(map, ['parking', 'parkingmode', 'parkmonitor'])),
  }
}

/**
 * `getsdstatus.cgi` — the card, which is the thing that actually fails.
 * @returns {{present?: boolean, totalMb?: number, freeMb?: number, usedPct?: number}}
 */
export function parseSdStatus(body) {
  const map = parseCgi(body)
  const present = asBool(pick(map, ['sdexist', 'sdcard', 'exist', 'mounted', 'sdstatus']))
  const totalMb = asInt(pick(map, ['total', 'totalspace', 'sdtotal', 'totalsize']))
  const freeMb = asInt(pick(map, ['free', 'freespace', 'sdfree', 'remain', 'freesize']))

  let usedPct
  if (totalMb && freeMb !== undefined && totalMb > 0) {
    usedPct = Math.max(0, Math.min(100, Math.round(((totalMb - freeMb) / totalMb) * 100)))
  }

  return {
    // A card that reports a size is present, whatever the status flag says.
    present: present !== undefined ? present : totalMb ? totalMb > 0 : undefined,
    totalMb,
    freeMb,
    usedPct,
  }
}

/**
 * `getwifi.cgi` — the camera's own access point.
 * @returns {{ssid?: string, channel?: number}}
 */
export function parseWifi(body) {
  const map = parseCgi(body)
  return {
    ssid: pick(map, ['ssid', 'wifissid', 'apssid', 'name']),
    channel: asInt(pick(map, ['channel', 'wifichannel'])),
  }
}

/**
 * Fold the individual replies into the one shape the UI and the relay use.
 *
 * @param {{deviceAttr?: string, workState?: string, sdStatus?: string, wifi?: string}} bodies
 * @returns {object}
 */
export function buildStatus(bodies = {}) {
  const device = parseDeviceAttr(bodies.deviceAttr)
  const work = parseWorkState(bodies.workState)
  const sd = parseSdStatus(bodies.sdStatus)
  const wifi = parseWifi(bodies.wifi)

  return {
    online: true,
    recording: work.recording,
    mode: work.mode,
    parking: work.parking,
    sd,
    wifi,
    device,
    at: Date.now(),
  }
}

/**
 * Canonicalise a camera name for comparison.
 *
 * Firmware is inconsistent about case and about separators — the same unit
 * turns up as `MYTVS_FNP8H0XW`, `MyTVS-FNP8H0XW` and `mytvs fnp8h0xw`
 * depending on whether the name came from the device attributes or the Wi-Fi
 * reply. All three are the same camera.
 *
 * @param {string|null|undefined} name
 * @returns {string} canonical name, or '' for empty/absent input
 */
export function normalizeCameraName(name) {
  if (name == null) return ''
  return String(name).trim().toUpperCase().replace(/[\s._-]+/g, '')
}

/**
 * Does this reading come from the pinned camera?
 *
 * Three-valued on purpose, because "I cannot tell" is not "no":
 *   true      — a reported name matches the pin
 *   false     — a name was reported and it is a different camera
 *   undefined — nothing identifying was reported, so no claim is made
 *
 * Older firmware omits `getdeviceattr.cgi` entirely, and that must not be
 * read as an intruder — it would put a false alarm on the screen every time
 * the camera answered with less detail than usual.
 *
 * @param {object|null} status
 * @param {{name: string, ssid: string}} pinned
 * @returns {boolean|undefined}
 */
export function isPinnedCamera(status, pinned) {
  const expected = [pinned?.name, pinned?.ssid].map(normalizeCameraName).filter(Boolean)
  if (!expected.length) return undefined

  const reported = [status?.device?.model, status?.wifi?.ssid]
    .map(normalizeCameraName)
    .filter(Boolean)
  if (!reported.length) return undefined

  // A match on either identifier is enough; the two come from different CGIs
  // and only one of them is often populated.
  return reported.some((name) => expected.includes(name))
}

/**
 * The vendor stamps firmware with a build date: `20250813.155628` is
 * 2025-08-13 15:56:28. Shown as the date, which is the part that means
 * something to a person; anything unrecognised is passed through untouched.
 *
 * @param {string|null|undefined} firmware
 * @returns {string|undefined}
 */
export function formatFirmware(firmware) {
  if (!firmware) return undefined
  const raw = String(firmware).trim()

  const match = /^(\d{4})(\d{2})(\d{2})(?:\.(\d{6}))?$/.exec(raw)
  if (!match) return raw

  const [, year, month, day] = match
  return `${year}-${month}-${day}`
}
