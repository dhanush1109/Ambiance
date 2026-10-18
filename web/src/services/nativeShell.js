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
 * Edge-to-edge black chrome with light status icons.
 *
 * iOS: overlay the webview so CSS `env(safe-area-inset-*)` is the single
 * source of truth. Capacitor's `contentInset: automatic` + CSS insets used to
 * double-pad and crush the layout under the notch / home indicator.
 *
 * Note the enum: `Style.Dark` means dark *background* → LIGHT icons.
 */
export function initStatusBar() {
  if (statusBarInited || !isNative()) return
  statusBarInited = true

  import('@capacitor/status-bar')
    .then(async ({ StatusBar, Style }) => {
      try {
        const plat =
          typeof window !== 'undefined' && window.Capacitor?.getPlatform
            ? window.Capacitor.getPlatform()
            : ''

        // Both platforms: draw under the status bar; tokens.css handles insets.
        await StatusBar.setOverlaysWebView({ overlay: true })
        await StatusBar.setStyle({ style: Style.Dark })
        if (plat !== 'ios') {
          // Android still accepts an explicit bar colour; iOS ignores it when overlaying.
          await StatusBar.setBackgroundColor({ color: '#000000' })
        }
      } catch {
        // Android 15 with targetSdk 35 enforces edge-to-edge and may ignore
        // these. Harmless here: the app is black to the edges anyway.
      }
    })
    .catch(() => {})
}
