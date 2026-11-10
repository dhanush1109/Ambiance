import { create } from 'zustand'
import { startClipSync, syncOnce } from '../services/dashcamUpload'

/**
 * Live view of the clip sync pipeline for the dashcam screen.
 *
 * The sync loop itself lives in dashcamUpload.js; this store is just what
 * the UI subscribes to so a progress line can update without the screen
 * owning the timer.
 */
export const useClipStore = create((set, get) => ({
  phase: 'idle',
  host: null,
  online: false,
  telegram: false,
  current: null,
  error: null,
  queue: [],
  ledger: [],
  running: false,
  _handle: null,

  applySnapshot(snapshot = {}) {
    set({
      phase: snapshot.phase ?? get().phase,
      host: snapshot.host ?? null,
      online: Boolean(snapshot.online),
      telegram: Boolean(snapshot.telegram),
      current: snapshot.current ?? null,
      error: snapshot.error ?? null,
      queue: Array.isArray(snapshot.queue) ? snapshot.queue : get().queue,
      ledger: Array.isArray(snapshot.ledger) ? snapshot.ledger : get().ledger,
    })
  },

  start() {
    if (get()._handle) return
    const handle = startClipSync({
      onChange: (snapshot) => get().applySnapshot(snapshot),
    })
    set({ running: true, _handle: handle })
  },

  stop() {
    const handle = get()._handle
    if (handle) handle.stop()
    set({ running: false, _handle: null })
  },

  async kick() {
    set({ phase: 'scanning', error: null })
    try {
      const snapshot = await syncOnce({
        onChange: (s) => get().applySnapshot(s),
      })
      get().applySnapshot(snapshot)
    } catch (err) {
      set({ phase: 'error', error: err.message })
    }
  },
}))
