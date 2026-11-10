/**
 * Camera-side clip listing and download.
 *
 * The recorder exposes footage as plain files under /CARDV/. While the phone
 * is on the camera's Wi-Fi those paths are reachable; the moment the phone
 * leaves for mobile data they are not. So "download now, upload later" is the
 * only pipeline that can ever put footage into Telegram Drive.
 *
 * Listing is deliberately tolerant: Novatek, Hisi and Yizhi firmwares disagree
 * on the CGI shape, and some units answer with a directory index HTML instead.
 * Anything that yields a filename + size is enough.
 */
import {
  CAMERA_HOSTS,
  CGI,
  CLIP_DIRS,
  MEDIA_ROOTS,
} from '../config/dashcam'
import { isDirectBlocked } from './dashcamApi'
import { isNative } from './platform'

const LIST_TIMEOUT_MS = 8_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000

const VIDEO_RE = /\.(mp4|mov|avi|ts|mkv)$/i

async function fetchWithTimeout(url, options = {}, timeoutMs = LIST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Probe which camera host answers. Returns null when none do — meaning this
 * phone is not on the camera's Wi-Fi right now.
 */
export async function findCameraHost() {
  if (isDirectBlocked()) return null
  for (const host of CAMERA_HOSTS) {
    try {
      const res = await fetchWithTimeout(`http://${host}/${CGI.heartbeat}`, {}, 2500)
      if (res.ok || res.status === 404) return host
    } catch {
      // try next
    }
    try {
      const res = await fetchWithTimeout(`http://${host}/${CGI.deviceAttr}`, {}, 2500)
      if (res.ok) return host
    } catch {
      // try next
    }
  }
  return null
}

/** @typedef {{ name: string, size: number, url: string, dir: string, locked: boolean }} CameraClip */

/**
 * List video clips on the camera.
 * @param {string} host
 * @returns {Promise<CameraClip[]>}
 */
export async function listCameraClips(host) {
  const found = []
  const seen = new Set()

  for (const dir of CLIP_DIRS) {
    const clips = await listDir(host, dir)
    for (const clip of clips) {
      const key = `${clip.name}::${clip.size}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push(clip)
    }
  }

  // Newest names first when the firmware embeds a date; otherwise stable.
  found.sort((a, b) => b.name.localeCompare(a.name))
  return found
}

async function listDir(host, dir) {
  const locked = dir === MEDIA_ROOTS.locked
  const attempts = [
    () => listViaDirIndex(host, dir, locked),
    () => listViaCgi(host, CGI.dirFileList, dir, locked),
    () => listViaCgi(host, CGI.fileList, dir, locked),
    () => listViaNovatek(host, dir, locked),
  ]

  for (const attempt of attempts) {
    try {
      const clips = await attempt()
      if (clips.length) return clips
    } catch {
      // try next dialect
    }
  }
  return []
}

/** HTML directory listing — many Novatek boxes serve one. */
async function listViaDirIndex(host, dir, locked) {
  const path = dir.endsWith('/') ? dir : `${dir}/`
  const res = await fetchWithTimeout(`http://${host}${path}`)
  if (!res.ok) throw new Error(`dir index ${res.status}`)
  const html = await res.text()
  return parseListing(html, host, path, locked)
}

/**
 * CGI listing. Firmwares emit key=value lines, JSON, or semicolon rows.
 * We pull out anything that looks like a video filename and an optional size.
 */
async function listViaCgi(host, cgi, dir, locked) {
  const folder = dir.replace(/^\/+|\/+$/g, '')
  const urls = [
    `http://${host}/${cgi}?&-dir=${encodeURIComponent(folder)}`,
    `http://${host}/${cgi}?dir=${encodeURIComponent(folder)}`,
    `http://${host}/${cgi}?path=${encodeURIComponent('/' + folder)}`,
  ]

  let body = ''
  let ok = false
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url)
      if (!res.ok) continue
      body = await res.text()
      ok = true
      break
    } catch {
      // next
    }
  }
  if (!ok) throw new Error('cgi list failed')

  const path = dir.endsWith('/') ? dir : `${dir}/`
  return parseListing(body, host, path, locked)
}

/** Novatek-style `?custom=1&cmd=3015` file list. */
async function listViaNovatek(host, dir, locked) {
  const folder = dir.replace(/^\/+|\/+$/g, '')
  const url =
    `http://${host}/?custom=1&cmd=3015&str=${encodeURIComponent(folder)}`
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`novatek ${res.status}`)
  const body = await res.text()
  const path = dir.endsWith('/') ? dir : `${dir}/`
  return parseListing(body, host, path, locked)
}

/**
 * Pull video filenames (and sizes when present) out of whatever the camera
 * returned — HTML anchors, JSON, or flat text.
 */
export function parseListing(body, host, dirPath, locked) {
  const clips = []
  const seen = new Set()
  const path = dirPath.endsWith('/') ? dirPath : `${dirPath}/`

  const consider = (rawName, rawSize) => {
    let name = String(rawName || '').trim()
    // Strip query strings and directory prefixes from hrefs.
    name = name.split('?')[0]
    name = name.replace(/^.*\//, '')
    if (!VIDEO_RE.test(name)) return
    if (seen.has(name)) return
    seen.add(name)

    let size = Number(rawSize)
    if (!Number.isFinite(size) || size < 0) size = 0

    clips.push({
      name,
      size,
      url: `http://${host}${path}${encodeURIComponent(name)}`,
      dir: path,
      locked: Boolean(locked),
    })
  }

  // HTML: <a href="FOO.MP4"> or href='/CARDV/MOVIE/FOO.MP4'
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi
  let m
  while ((m = hrefRe.exec(body))) {
    consider(m[1], 0)
  }

  // JSON-ish: "name":"FOO.MP4" ... "size":12345
  try {
    const json = JSON.parse(body)
    const rows = Array.isArray(json) ? json : json?.files || json?.list || json?.data || []
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const name = row?.name || row?.file || row?.filename || row?.n
        const size = row?.size || row?.filesize || row?.len || row?.s
        consider(name, size)
      }
    }
  } catch {
    // not JSON
  }

  // Flat lines: FOO.MP4 12345678   or  name=FOO.MP4 size=123
  for (const line of String(body).split(/\r?\n/)) {
    const named = line.match(/([^\s="'<>]+\.(?:mp4|mov|avi|ts|mkv))/i)
    if (!named) continue
    const sizeMatch = line.match(/(?:size|filesize|len)\s*[=:]\s*(\d+)/i)
      || line.match(/\b(\d{4,})\b/)
    consider(named[1], sizeMatch ? sizeMatch[1] : 0)
  }

  return clips
}

/**
 * Download a clip onto this device.
 *
 * Capacitor 7's Filesystem has no native download helper, so the bytes come
 * through fetch and are written as base64. That doubles peak memory — fine
 * under the 49 MB Bot API ceiling this pipeline is built around, and the
 * reason larger clips are skipped rather than cached.
 *
 * @param {CameraClip} clip
 * @param {{ onProgress?: (ratio: number) => void }} [opts]
 * @returns {Promise<{ path: string, size: number, directory: string, blob?: Blob }>}
 */
export async function downloadClip(clip, opts = {}) {
  if (!clip?.url || !clip?.name) throw new Error('Nothing to download')

  const safeName = clip.name.replace(/[^A-Za-z0-9._-]/g, '_')
  const relativePath = `dashcam/${safeName}`

  const res = await fetchWithTimeout(clip.url, {}, DOWNLOAD_TIMEOUT_MS)
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`)
  const blob = await res.blob()
  opts.onProgress?.(0.7)

  if (isNative()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    try {
      await Filesystem.mkdir({
        path: 'dashcam',
        directory: Directory.Data,
        recursive: true,
      })
    } catch {
      // already exists
    }

    const base64 = await blobToBase64(blob)
    await Filesystem.writeFile({
      path: relativePath,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    })

    opts.onProgress?.(1)
    return { path: relativePath, size: blob.size, directory: 'DATA' }
  }

  opts.onProgress?.(1)
  return {
    path: relativePath,
    size: blob.size,
    directory: 'MEMORY',
    blob,
  }
}

/** Blob → raw base64 (no data: URL prefix), for Filesystem.writeFile. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

/**
 * Delete a locally cached clip after a successful Telegram upload.
 * Failures are swallowed — a leftover cache file is cheaper than a crash.
 */
export async function deleteLocalClip(local) {
  if (!local?.path) return
  if (local.directory === 'MEMORY') return
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.deleteFile({
      path: local.path,
      directory: Directory.Data,
    })
  } catch {
    // ignore
  }
}
