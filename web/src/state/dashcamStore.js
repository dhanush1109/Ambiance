import { create } from 'zustand'
import { STALE_AFTER_MS } from '../config/dashcam'
import * as dashcam from '../services/dashcamApi'

/**
 * Dash Cam Pro+ status.
 *
 * Not persisted, for the same reason the controller link is not: a recording
 * state remembered from last run is worse than no answer at all. But the last
 * reading is kept in memory across tab switches, so reopening the screen shows
 * something immediately while the next read is in flight.
 */
export const useDashcamStore = create((set, get) => ({
  /** idle | loading | ready | offline | error | unpaired */
  phase: 'idle',
  /** Last known status, or null if never read. */
  status: null,
  error: null,

  /**
   * Read status once. Never throws — the screen renders the failure instead.
   * @param {{quiet?: boolean}} [opts] quiet skips the spinner on background polls
   */
  refresh: async ({ quiet = false } = {}) => {
    if (!quiet) set({ phase: 'loading', error: null })

    try {
      const status = await dashcam.read()
      if (status) {
        set({ phase: 'ready', status, error: null })
      } else {
        // Reached the relay, but nothing has ever reported.
        set({ phase: 'offline', error: null })
      }
    } catch (err) {
      // Needing a code is a question to ask, not a fault to report. The last
      // reading is dropped with it: it belongs to whoever was paired before.
      if (err?.name === 'PairingRequiredError') {
        set({ phase: 'unpaired', status: null, error: null })
        return
      }
      // Keep the previous reading on screen; it is still the best thing known.
      set({ phase: get().status ? 'error' : 'offline', error: String(err?.message ?? err) })
    }
  },

  /**
   * Pair this device, then read straight away so the screen fills in.
   * Throws on a bad code so the form can show why.
   * @param {string} code
   */
  pair: async (code) => {
    await dashcam.pair(code)
    await get().refresh()
  },

  /** Forget the code on this device and clear what it was showing. */
  unpair: async () => {
    await dashcam.unpair()
    set({ phase: 'unpaired', status: null, error: null })
  },

  /**
   * Start or stop recording, then re-read so the UI reflects the camera
   * rather than our assumption about it.
   * @param {'start'|'stop'|'trigger'} action
   */
  command: async (action) => {
    await dashcam.command(action, get().status?.host)
    await get().refresh({ quiet: true })
  },

  reset: () => set({ phase: 'idle', status: null, error: null }),
}))

/**
 * Age of a reading in ms, or Infinity when there is none.
 *
 * Takes the timestamp, not the store: as a selector this would return a
 * different number on every render and spin zustand into an endless
 * re-render loop. Components pass `status.at` and supply their own clock.
 *
 * @param {number|null|undefined} at
 * @param {number} [now]
 */
export function statusAge(at, now = Date.now()) {
  return typeof at === 'number' ? now - at : Infinity
}

/**
 * A reading older than the stale window is reported as "last seen" rather
 * than as live: a camera that stopped answering ten minutes ago must not keep
 * claiming it is recording.
 *
 * Safe as a selector — the result is a boolean, so it only changes when the
 * reading actually crosses the threshold.
 */
export const isLive = (s) => statusAge(s.status?.at) < STALE_AFTER_MS
