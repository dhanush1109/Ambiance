/**
 * Serialises every BLE write.
 *
 * Two jobs:
 *
 *  1. Spacing. The ATW box drops frames if you push them back to back, so
 *     writes are held at least QUEUE_GAP_MS apart.
 *
 *  2. Coalescing. Dragging a colour wheel can generate a hundred updates a
 *     second. A queued-but-not-yet-sent command is REPLACED when a newer one
 *     with the same key arrives, so the queue never grows a backlog and the
 *     lights track your thumb instead of lagging seconds behind it.
 *     An in-flight command is never cancelled — only pending ones are replaced.
 */

export const QUEUE_GAP_MS = 40
const RETRY_DELAY_MS = 120

/** @type {Array<{key: string, run: () => Promise<any>}>} */
let pending = []
let running = false
let lastSentAt = 0
let errorHandler = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function onQueueError(fn) {
  errorHandler = fn
}

export function queueDepth() {
  return pending.length
}

export function clearQueue() {
  pending = []
}

/**
 * @param {string} key    commands sharing a key coalesce (e.g. 'color:1')
 * @param {() => Promise<any>} run
 * @param {{coalesce?: boolean}} [opts]
 */
export function enqueue(key, run, opts = {}) {
  const coalesce = opts.coalesce !== false

  if (coalesce) {
    const i = pending.findIndex((c) => c.key === key)
    if (i >= 0) pending[i] = { key, run } // newest value wins
    else pending.push({ key, run })
  } else {
    pending.push({ key, run })
  }

  if (!running) drain()
}

async function drain() {
  running = true
  try {
    while (pending.length) {
      const cmd = pending.shift()

      const wait = QUEUE_GAP_MS - (Date.now() - lastSentAt)
      if (wait > 0) await sleep(wait)

      try {
        await cmd.run()
      } catch (first) {
        // One retry — BLE writes fail transiently far more often than fatally
        await sleep(RETRY_DELAY_MS)
        try {
          await cmd.run()
        } catch (second) {
          errorHandler?.(second, cmd.key)
        }
      }
      lastSentAt = Date.now()
    }
  } finally {
    running = false
  }
}

/** Test seam. */
export function _resetQueue() {
  pending = []
  running = false
  lastSentAt = 0
  errorHandler = null
}
