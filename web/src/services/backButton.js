import { useUiStore } from '../state/uiStore'

/**
 * Android's back button.
 *
 * Without a listener, Capacitor lets the system finish the activity — so back
 * from anywhere quit the app, including with a dialog open. Registering any
 * listener suppresses that, which makes minimising an explicit choice rather
 * than the default.
 */

/**
 * Pure decision, split out so it can be tested without Capacitor.
 * @returns {'close-sheet'|'go-home'|'minimize'}
 */
export function backAction({ sheetCount, tab }) {
  if (sheetCount > 0) return 'close-sheet'
  if (tab !== 'home') return 'go-home'
  return 'minimize'
}

/** @param {{minimizeApp: () => Promise<void>}} appApi */
export function handleBackButton(appApi) {
  const { sheets, tab, setTab } = useUiStore.getState()

  switch (backAction({ sheetCount: sheets.length, tab })) {
    case 'close-sheet':
      // The sheet's own onClose, so the parent's state clears properly
      sheets[sheets.length - 1].close()
      break
    case 'go-home':
      setTab('home')
      break
    default:
      // Rejects on web, where there is no activity to minimise
      appApi?.minimizeApp?.().catch(() => {})
  }
}

/**
 * Registers the listener. Returns a remover, safe to call before the async
 * registration resolves.
 */
export function initBackButton() {
  let removed = false
  let handle = null

  import('@capacitor/app')
    .then((mod) => {
      if (removed || !mod?.App?.addListener) return
      return mod.App.addListener('backButton', () => handleBackButton(mod.App)).then((h) => {
        handle = h
        if (removed) h?.remove?.()
      })
    })
    .catch(() => {
      // Plain browser — there is no hardware back button to handle
    })

  return () => {
    removed = true
    handle?.remove?.()
    handle = null
  }
}
