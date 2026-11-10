/**
 * Pull clips from the camera, push them to Telegram when online.
 *
 * PIPELINE
 * --------
 *   on camera Wi-Fi  → list files → download anything not already uploaded
 *   on internet      → claim in the shared ledger → sendDocument → confirm
 *
 * Every Ambiance install runs the same loop. The ledger on the relay is what
 * stops two phones that both sat in the car from uploading the same clip
 * twice. A claim that sits unfinished for 30 minutes is released so another
 * device can take over.
 *
 * TELEGRAM DRIVE
 * --------------
 * Telegram Drive has no mobile API. Uploads go to a private channel via the
 * Bot API; Telegram Drive opens that same channel as a folder. That is the
 * whole integration — we never talk to Telegram Drive itself.
 *
 * SIZE CEILING
 * ------------
 * Public Bot API caps uploads at ~50 MB. Clips over TELEGRAM_MAX_BYTES are
 * marked skipped in the ledger so every device stops retrying them. Pull
 * those with Telegram Drive's desktop Folder Sync if you need them.
 */
import {
  CLIP_QUEUE_KEY,
  CLIP_SYNC_MS,
  CLIPS_PATH,
  DEVICE_ID_KEY,
  RELAY_ORIGIN,
  TELEGRAM_MAX_BYTES,
  TELEGRAM_PATH,
} from '../config/dashcam'
import { getPairCode } from './dashcamApi'
import {
  deleteLocalClip,
  downloadClip,
  findCameraHost,
  listCameraClips,
} from './dashcamClips'
import { isNative } from './platform'
import { storage } from './storage'

function apiUrl(path) {
  return isNative() ? `${RELAY_ORIGIN}${path}` : path
}

async function pairHeaders(extra = {}) {
  const code = await getPairCode()
  const headers = { ...extra }
  if (code) headers['x-dashcam-pair'] = code
  return headers
}

/** Stable id for this install — created once, then reused for claims. */
export async function getDeviceId() {
  let id = await storage.getItem(DEVICE_ID_KEY)
  if (id) return id
  id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  await storage.setItem(DEVICE_ID_KEY, id)
  return id
}

async function loadQueue() {
  try {
    const raw = await storage.getItem(CLIP_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function saveQueue(queue) {
  await storage.setItem(CLIP_QUEUE_KEY, JSON.stringify(queue.slice(0, 200)))
}

/**
 * @typedef {{
 *   name: string,
 *   size: number,
 *   url: string,
 *   locked: boolean,
 *   state: 'queued'|'downloading'|'ready'|'uploading'|'uploaded'|'skipped'|'error',
 *   localPath?: string,
 *   localDirectory?: string,
 *   error?: string,
 *   updatedAt: number,
 * }} QueuedClip
 */

let telegramConfig = null
let telegramConfigAt = 0

/** Bot token + chat id, cached briefly so a sync loop does not re-fetch every tick. */
export async function getTelegramConfig() {
  if (telegramConfig && Date.now() - telegramConfigAt < 5 * 60_000) {
    return telegramConfig
  }
  const headers = await pairHeaders()
  const res = await fetch(apiUrl(TELEGRAM_PATH), { headers })
  if (res.status === 401) throw new Error('Pair this device before uploading')
  if (res.status === 503) {
    telegramConfig = { configured: false }
    telegramConfigAt = Date.now()
    return telegramConfig
  }
  if (!res.ok) throw new Error(`Telegram config HTTP ${res.status}`)
  telegramConfig = await res.json()
  telegramConfigAt = Date.now()
  return telegramConfig
}

/** Clear cached credentials after unpair / config change. */
export function clearTelegramConfigCache() {
  telegramConfig = null
  telegramConfigAt = 0
}

/**
 * Bot API will not hand a file path back above this size. Larger clips still
 * open in Telegram via the message link.
 */
const TELEGRAM_GETFILE_MAX = 20 * 1024 * 1024

/**
 * Deep link into the channel message that holds a clip.
 * Channel ids look like -1003984566627 → https://t.me/c/3984566627/<msg>
 */
export function telegramMessageUrl(chatId, messageId) {
  if (chatId == null || messageId == null) return null
  const raw = String(chatId).replace(/^-100/, '').replace(/^-/, '')
  if (!raw || !messageId) return null
  return `https://t.me/c/${raw}/${messageId}`
}

/**
 * Resolve how to watch a ledger clip inside Ambiance.
 *
 * Prefer an in-app stream when Telegram will give us a file URL; otherwise
 * fall back to opening the channel message in Telegram so nothing is stranded
 * behind a separate "Drive" app.
 *
 * @param {{ name: string, size?: number, telegramFileId?: string, messageId?: number }} clip
 * @returns {Promise<{ mode: 'stream'|'telegram'|'unavailable', url?: string, reason?: string }>}
 */
export async function resolveClipPlayback(clip) {
  if (!clip) return { mode: 'unavailable', reason: 'No clip' }

  const tg = await getTelegramConfig()
  if (!tg?.configured) {
    return { mode: 'unavailable', reason: 'Cloud backup is not configured' }
  }

  const openInTelegram = telegramMessageUrl(tg.chatId, clip.messageId)

  // Prefer streaming when under the getFile ceiling and we have a file id.
  if (clip.telegramFileId && (!clip.size || clip.size <= TELEGRAM_GETFILE_MAX)) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${tg.botToken}/getFile?file_id=${encodeURIComponent(clip.telegramFileId)}`,
      )
      const body = await res.json()
      if (body.ok && body.result?.file_path) {
        return {
          mode: 'stream',
          url: `https://api.telegram.org/file/bot${tg.botToken}/${body.result.file_path}`,
          name: clip.name,
        }
      }
    } catch {
      // fall through to Telegram link
    }
  }

  if (openInTelegram) {
    return { mode: 'telegram', url: openInTelegram, name: clip.name }
  }

  return {
    mode: 'unavailable',
    reason: 'This clip has no playable link yet',
  }
}

export async function fetchLedger() {
  const headers = await pairHeaders()
  const res = await fetch(apiUrl(CLIPS_PATH), { headers })
  if (res.status === 401) throw new Error('Pair this device first')
  if (!res.ok) throw new Error(`Clip ledger HTTP ${res.status}`)
  const body = await res.json()
  return Array.isArray(body.clips) ? body.clips : []
}

async function ledgerAction(action, clip, extra = {}) {
  const deviceId = await getDeviceId()
  const headers = await pairHeaders({
    'content-type': 'application/json',
    'x-dashcam-device': deviceId,
  })
  const res = await fetch(apiUrl(CLIPS_PATH), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action,
      name: clip.name,
      size: clip.size,
      deviceId,
      ...extra,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (res.status === 409) {
    return { conflict: true, clip: body.clip }
  }
  if (!res.ok) {
    throw new Error(body.error || `Ledger ${action} failed (${res.status})`)
  }
  return { conflict: false, clip: body.clip, already: body.already }
}

function ledgerMap(clips) {
  const map = new Map()
  for (const c of clips) {
    map.set(String(c.name || '').toLowerCase(), c)
  }
  return map
}

/**
 * One sync tick.
 *
 * Safe to call from a timer or a button. Does a small amount of work per
 * call — at most one download and one upload — so a slow link cannot pile
 * up overlapping transfers.
 *
 * @param {{ onChange?: (snapshot: object) => void }} [opts]
 */
export async function syncOnce(opts = {}) {
  const notify = (patch) => opts.onChange?.(patch)
  const queue = await loadQueue()

  // No pairing code → nowhere to record uploads and no bot credentials.
  // Stay quiet rather than spamming 401s while the owner is still pairing.
  const code = await getPairCode()
  if (!code) {
    const snapshot = { phase: 'unpaired', queue, online: false, telegram: false }
    notify(snapshot)
    return snapshot
  }

  let ledger = []
  try {
    ledger = await fetchLedger()
  } catch (err) {
    notify({ phase: 'error', error: err.message, queue })
    return { queue, error: err.message }
  }
  const uploaded = ledgerMap(ledger)

  // Drop local entries the ledger already finished (another device may have
  // uploaded them while we were offline).
  let next = queue.filter((item) => {
    const remote = uploaded.get(String(item.name).toLowerCase())
    if (remote?.state === 'uploaded' || remote?.state === 'skipped') {
      if (item.localPath) {
        deleteLocalClip({ path: item.localPath, directory: item.localDirectory })
      }
      return false
    }
    return true
  })

  // --- Pull from camera when reachable ---
  const host = await findCameraHost()
  if (host) {
    notify({ phase: 'scanning', host, queue: next })
    try {
      const remoteClips = await listCameraClips(host)
      for (const clip of remoteClips) {
        const key = String(clip.name).toLowerCase()
        const remote = uploaded.get(key)
        if (remote?.state === 'uploaded' || remote?.state === 'skipped') continue
        if (next.some((q) => String(q.name).toLowerCase() === key)) continue

        const size = clip.size || 0
        if (size > TELEGRAM_MAX_BYTES) {
          await ledgerAction('skip', { name: clip.name, size }, { reason: 'too_large' })
          continue
        }

        next.push({
          name: clip.name,
          size,
          url: clip.url,
          locked: clip.locked,
          state: 'queued',
          updatedAt: Date.now(),
        })
      }
    } catch (err) {
      notify({ phase: 'error', error: `Camera list: ${err.message}`, queue: next })
    }
  }

  // Download at most one queued clip per tick while on camera Wi-Fi.
  if (host) {
    const toDownload = next.find((q) => q.state === 'queued' || (q.state === 'error' && !q.localPath))
    if (toDownload) {
      toDownload.state = 'downloading'
      toDownload.updatedAt = Date.now()
      await saveQueue(next)
      notify({ phase: 'downloading', current: toDownload.name, queue: next })
      try {
        const local = await downloadClip({
          name: toDownload.name,
          url: toDownload.url,
          size: toDownload.size,
        })
        toDownload.size = local.size || toDownload.size
        toDownload.localPath = local.path
        toDownload.localDirectory = local.directory
        toDownload.blob = local.blob
        toDownload.state = 'ready'
        toDownload.error = undefined
        toDownload.updatedAt = Date.now()

        if (toDownload.size > TELEGRAM_MAX_BYTES) {
          await ledgerAction('skip', toDownload, { reason: 'too_large' })
          toDownload.state = 'skipped'
          await deleteLocalClip(local)
        }
      } catch (err) {
        toDownload.state = 'error'
        toDownload.error = err.message || 'Download failed'
        toDownload.updatedAt = Date.now()
      }
    }
  }

  // --- Push to Telegram when we have internet ---
  // Camera Wi-Fi has no route to api.telegram.org, so never attempt an
  // upload while we can still see the recorder.
  const online = !host && (await hasNetwork())
  const tg = online ? await getTelegramConfig().catch(() => ({ configured: false })) : null

  if (online && tg?.configured) {
    const toUpload = next.find((q) => q.state === 'ready' || (q.state === 'error' && q.localPath))
    if (toUpload) {
      toUpload.state = 'uploading'
      toUpload.updatedAt = Date.now()
      await saveQueue(next)
      notify({ phase: 'uploading', current: toUpload.name, queue: next })

      try {
        const claim = await ledgerAction('claim', toUpload)
        if (claim.already || claim.conflict) {
          toUpload.state = 'uploaded'
          if (toUpload.localPath) {
            await deleteLocalClip({
              path: toUpload.localPath,
              directory: toUpload.localDirectory,
            })
          }
        } else {
          const sent = await uploadToTelegram(toUpload, tg)
          await ledgerAction('confirm', toUpload, {
            messageId: sent.messageId,
            telegramFileId: sent.fileId,
          })
          toUpload.state = 'uploaded'
          toUpload.updatedAt = Date.now()
          if (toUpload.localPath) {
            await deleteLocalClip({
              path: toUpload.localPath,
              directory: toUpload.localDirectory,
            })
          }
          delete toUpload.blob
        }
      } catch (err) {
        try {
          await ledgerAction('release', toUpload)
        } catch {
          // best effort
        }
        toUpload.state = 'error'
        toUpload.error = err.message || 'Upload failed'
        toUpload.updatedAt = Date.now()
      }
    }
  } else if (online && tg && !tg.configured) {
    notify({
      phase: 'need_telegram',
      error: 'Telegram upload is not configured on the server yet',
      queue: next,
    })
  }

  // Prune finished rows from the local queue.
  next = next.filter((q) => q.state !== 'uploaded' && q.state !== 'skipped')
  await saveQueue(next)

  const snapshot = {
    phase: host ? 'camera' : online ? 'online' : 'idle',
    host,
    online,
    telegram: Boolean(tg?.configured),
    queue: next,
    ledger,
  }
  notify(snapshot)
  return snapshot
}

async function hasNetwork() {
  try {
    const { Network } = await import('@capacitor/network')
    const status = await Network.getStatus()
    return Boolean(status?.connected)
  } catch {
    // Browser without the plugin: navigator.onLine is a hint, not a proof.
    return typeof navigator === 'undefined' ? false : Boolean(navigator.onLine)
  }
}

/**
 * sendDocument to the configured chat.
 * @param {QueuedClip} clip
 * @param {{ botToken: string, chatId: string }} tg
 */
async function uploadToTelegram(clip, tg) {
  const form = new FormData()
  form.append('chat_id', tg.chatId)
  form.append('caption', clip.locked ? `Dashcam (locked) ${clip.name}` : `Dashcam ${clip.name}`)
  form.append('disable_content_type_detection', 'true')

  let blob = clip.blob
  if (!blob && clip.localPath && clip.localDirectory === 'DATA') {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const file = await Filesystem.readFile({
      path: clip.localPath,
      directory: Directory.Data,
    })
    blob = base64ToBlob(file.data, guessMime(clip.name))
  }
  if (!blob) throw new Error('No local file to upload')

  form.append('document', blob, clip.name)

  const res = await fetch(`https://api.telegram.org/bot${tg.botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.ok) {
    throw new Error(body?.description || `Telegram HTTP ${res.status}`)
  }

  const doc = body.result?.document || body.result?.video || {}
  return {
    messageId: body.result?.message_id,
    fileId: doc.file_id,
  }
}

function guessMime(name) {
  const lower = String(name).toLowerCase()
  if (lower.endsWith('.mp4')) return 'video/mp4'
  if (lower.endsWith('.mov')) return 'video/quicktime'
  if (lower.endsWith('.avi')) return 'video/x-msvideo'
  if (lower.endsWith('.mkv')) return 'video/x-matroska'
  return 'application/octet-stream'
}

function base64ToBlob(base64, mime) {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Run syncOnce on an interval until stop() is called.
 * @param {{ onChange?: Function, intervalMs?: number }} [opts]
 */
export function startClipSync(opts = {}) {
  const intervalMs = opts.intervalMs ?? CLIP_SYNC_MS
  let stopped = false
  let timer = null
  let running = false

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      await syncOnce({ onChange: opts.onChange })
    } catch (err) {
      opts.onChange?.({ phase: 'error', error: err.message })
    } finally {
      running = false
      if (!stopped) timer = setTimeout(tick, intervalMs)
    }
  }

  tick()

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
    },
    kick() {
      if (!stopped) tick()
    },
  }
}

export { CLIP_SYNC_MS }
