import { useLightStore } from '../state/lightStore'
import { useConnectionStore } from '../state/connectionStore'
import { runWelcome } from './welcome'
import { createDrift } from './drift'
import { applyTimeOfDay } from './timeOfDay'

/**
 * App-driven light effects.
 *
 * The firmware has no concept of these — they are the app sending a sequence of
 * ordinary colour commands. That makes the stop guards essential: a stray timer
 * still writing colours after the driver has taken manual control would be the
 * worst bug this app could ship. Four things halt the engine:
 *
 *   1. any manual command  (lightStore.lastManualAt changes)
 *   2. the link dropping
 *   3. the app going to the background
 *   4. a firmware animation starting
 */

let current = null // { name, stop() }
let unsubManual = null
let unsubConn = null
let unsubMode = null
let appListener = null
let baselineManualAt = 0

function watch() {
  const light = useLightStore

  unsubManual = light.subscribe((s, prev) => {
    if (s.lastManualAt !== prev.lastManualAt && s.lastManualAt > baselineManualAt) {
      ambient.stop('manual')
    }
  })

  unsubMode = light.subscribe((s, prev) => {
    if (s.activeMode && s.activeMode !== prev.activeMode) ambient.stop('firmware-animation')
  })

  unsubConn = useConnectionStore.subscribe((s) => {
    if (s.status !== 'connected') ambient.stop('disconnected')
  })

  // WebView timers are throttled in the background anyway — stop cleanly
  // rather than letting a loop resume with stale state.
  import('@capacitor/app')
    .then((mod) => {
      if (!mod?.App?.addListener) return
      mod.App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) ambient.stop('background')
      }).then((handle) => {
        appListener = handle
      })
    })
    .catch(() => {
      // Plain browser: fall back to the visibility API
      const onHide = () => {
        if (document.hidden) ambient.stop('background')
      }
      document.addEventListener('visibilitychange', onHide)
      appListener = { remove: () => document.removeEventListener('visibilitychange', onHide) }
    })
}

function unwatch() {
  unsubManual?.()
  unsubMode?.()
  unsubConn?.()
  appListener?.remove?.()
  unsubManual = unsubConn = unsubMode = appListener = null
}

export const ambient = {
  isRunning: () => current !== null,
  current: () => current?.name ?? null,

  /**
   * @param {'welcome'|'drift'|'timeOfDay'} effect
   */
  async start(effect, opts = {}) {
    ambient.stop('replaced')

    // Engine-issued commands pass manual:false, so anything above this
    // baseline is a real human action.
    baselineManualAt = useLightStore.getState().lastManualAt
    watch()

    if (effect === 'welcome') {
      current = { name: 'welcome', stop: () => {} }
      const handle = runWelcome(opts)
      current.stop = handle.stop
      await handle.done
      if (current?.name === 'welcome') ambient.stop('finished')
      return
    }

    if (effect === 'drift') {
      current = createDrift(opts)
      useLightStore.getState().setDrift(true)
      current.start()
      return
    }

    if (effect === 'timeOfDay') {
      current = { name: 'timeOfDay', stop: () => {} }
      applyTimeOfDay()
      ambient.stop('finished')
    }
  },

  stop(reason = 'stopped') {
    if (!current) {
      unwatch()
      return
    }
    const name = current.name
    try {
      current.stop?.(reason)
    } finally {
      current = null
      unwatch()
      if (name === 'drift') useLightStore.getState().setDrift(false)
    }
  },
}
