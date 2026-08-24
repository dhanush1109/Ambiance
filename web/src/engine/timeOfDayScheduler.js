import { ambient } from './ambientEngine'
import { useConnectionStore } from '../state/connectionStore'
import { useLightStore } from '../state/lightStore'
import { useSettingsStore } from '../state/settingsStore'

/**
 * Keeps the cabin in step with the time of day on a long drive — dusk actually
 * arriving while you are driving through it.
 *
 * The engine's timeOfDay effect applies once and stops, so something has to ask
 * it again. This is that something.
 */

export const TIME_OF_DAY_TICK_MS = 30 * 60_000

/**
 * Whether a tick should act. Pure, so the guard logic is testable.
 *
 * The important one is `lastManualAt <= baseline`: the moment the driver
 * touches any control, this stands down for the rest of the session. Waiting
 * out a quiet period instead would eventually overwrite a colour someone chose
 * deliberately, which is exactly the behaviour the ambient engine exists to
 * prevent.
 */
export function shouldReapply({
  enabled,
  connected,
  visible,
  engineRunning,
  activeMode,
  lastManualAt,
  baseline,
}) {
  if (!enabled || !connected || !visible) return false
  if (engineRunning) return false // don't interrupt drift
  if (activeMode) return false // a firmware animation is the driver's choice
  return lastManualAt <= baseline
}

let inited = false
let timer = null
let baseline = 0

function stop() {
  if (timer) clearInterval(timer)
  timer = null
}

function tick() {
  if (
    shouldReapply({
      enabled: useSettingsStore.getState().timeOfDayTheme,
      connected: useConnectionStore.getState().status === 'connected',
      visible: typeof document === 'undefined' || document.visibilityState === 'visible',
      engineRunning: ambient.isRunning(),
      activeMode: useLightStore.getState().activeMode,
      lastManualAt: useLightStore.getState().lastManualAt,
      baseline,
    })
  ) {
    ambient.start('timeOfDay')
  }
}

export function initTimeOfDayScheduler() {
  if (inited) return
  inited = true

  useConnectionStore.subscribe((s, prev) => {
    if (s.status === prev.status) return

    if (s.status === 'connected') {
      // Fresh session: anything the driver did before now doesn't count
      baseline = useLightStore.getState().lastManualAt
      stop()
      timer = setInterval(tick, TIME_OF_DAY_TICK_MS)
    } else if (prev.status === 'connected') {
      stop()
    }
  })
}

/** Test seam. */
export function _resetScheduler() {
  stop()
  inited = false
  baseline = 0
}
