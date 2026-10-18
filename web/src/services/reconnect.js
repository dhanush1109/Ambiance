import { controller } from './controller'
import { getTransport, transportKind } from './transport'
import { useConnectionStore } from '../state/connectionStore'
import { useSettingsStore } from '../state/settingsStore'

/**
 * Keeps the link alive without nagging.
 *
 * Backoff grows so a controller that is genuinely off (car parked, ignition
 * out) does not sit there retrying every second and draining the phone.
 */

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000]

let timer = null
let stopped = true
let attempt = 0

export function isReconnecting() {
  return !stopped && timer !== null
}

export function startAutoReconnect() {
  if (!useSettingsStore.getState().autoReconnect) return
  // Web Bluetooth needs a tap; Safari has no Bluetooth at all.
  const kind = transportKind()
  if (kind === 'web' || kind === 'unavailable') return
  stopped = false
  attempt = 0
  attemptConnect()
}

export function stopAutoReconnect() {
  stopped = true
  attempt = 0
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const conn = useConnectionStore.getState()
  if (conn.status === 'reconnecting') conn.setStatus('idle')
}

async function attemptConnect() {
  if (stopped) return
  if (getTransport().isConnected()) {
    attempt = 0
    return
  }

  const conn = useConnectionStore.getState()
  conn.setStatus(attempt === 0 ? 'connecting' : 'reconnecting')
  conn.setAttempt(attempt + 1)

  try {
    await controller.connectPinned()
    attempt = 0
    timer = null
  } catch {
    if (stopped) return
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
    attempt += 1
    conn.setStatus('reconnecting')
    timer = setTimeout(attemptConnect, delay)
  }
}

/** Called by the transport's disconnect callback. */
export function handleDrop() {
  if (!useSettingsStore.getState().autoReconnect) return
  const kind = transportKind()
  if (kind === 'web' || kind === 'unavailable') return
  stopped = false
  attempt = 0
  if (timer) clearTimeout(timer)
  timer = setTimeout(attemptConnect, BACKOFF_MS[0])
}
