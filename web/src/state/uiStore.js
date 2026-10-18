import { create } from 'zustand'

let toastTimer = null
let toastSeq = 0

/** Ephemeral shell state: which tab is showing, and the current toast. */
export const useUiStore = create((set) => ({
  tab: 'home',
  toast: null,
  /** Open sheets, oldest first. The hardware back button closes the top one. */
  sheets: [],

  setTab: (tab) => set({ tab }),

  registerSheet: (id, close) =>
    set((s) => ({ sheets: [...s.sheets.filter((x) => x.id !== id), { id, close }] })),

  unregisterSheet: (id) => set((s) => ({ sheets: s.sheets.filter((x) => x.id !== id) })),

  /** @param {string} text @param {'info'|'ok'|'error'} tone */
  showToast: (text, tone = 'info') => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: { id: ++toastSeq, text, tone } })
    toastTimer = setTimeout(() => {
      toastTimer = null
      set({ toast: null })
    }, 2600)
  },

  hideToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toast: null })
  },
}))

/** Primary tab bar — Settings lives in the header gear (keeps ≤5 tabs). */
export const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'moods', label: 'Moods', icon: 'moods' },
  { id: 'effects', label: 'Effects', icon: 'effects' },
  { id: 'favorites', label: 'Saved', icon: 'favorites' },
  { id: 'dashcam', label: 'Dash Cam', icon: 'dashcam' },
]
