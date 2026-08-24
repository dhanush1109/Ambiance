import { useSettingsStore } from '../state/settingsStore'

/**
 * Native chrome: the status bar, and keeping the screen awake.
 *
 * Both are no-ops in a browser. Plugins are imported dynamically so the web
 * build never pulls them in.
 */

function isNative() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
}

/* ---------------- keep awake ---------------- */

let keepAwakeInited = false

async function applyKeepAwake(on) {
  try {
    const mod = await import('@capacitor-community/keep-awake')
    if (!mod?.KeepAwake) return
    if (on) await mod.KeepAwake.keepAwake()
    else await mod.KeepAwake.allowSleep()
  } catch {
    // No plugin, or the OS refused — the screen simply behaves normally
  }
}

/**
 * The setting existed but nothing acted on it. Subscribes for the life of the
 * app: persisted state rehydrates through `set`, so a stored `true` is applied
 * as soon as it loads.
 */
export function initKeepAwake() {
  if (keepAwakeInited || !isNative()) return
  keepAwakeInited = true

  const settings = useSettingsStore.getState()
  if (settings.keepAwake) applyKeepAwake(true)

  useSettingsStore.subscribe((s, prev) => {
    if (s.keepAwake !== prev.keepAwake) applyKeepAwake(s.keepAwake)
  })
}

/* ---------------- status bar ---------------- */

let statusBarInited = false

/**
 * Black bar with light icons, matching the app.
 *
 * Note the enum: `Style.Dark` means "dark background", which gives LIGHT
 * icons — the opposite of what the name suggests at a glance.
 */
export function initStatusBar() {
  if (statusBarInited || !isNative()) return
  statusBarInited = true

  import('@capacitor/status-bar')
    .then(async ({ StatusBar, Style }) => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false })
        await StatusBar.setBackgroundColor({ color: '#000000' })
        await StatusBar.setStyle({ style: Style.Dark })
      } catch {
        // Android 15 with targetSdk 35 enforces edge-to-edge and may ignore
        // these. Harmless here: the app is black to the edges anyway.
      }
    })
    .catch(() => {})
}
