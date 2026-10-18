/**
 * Which shell the app is running in.
 *
 * Capacitor injects a global rather than requiring an import, so this stays a
 * plain check and works in a browser, in tests, and inside the Android
 * WebView without pulling in @capacitor/core.
 *
 * This matters more than it looks. In the Android app the page is served from
 * `https://localhost`, so every browser-shaped assumption about the page's
 * origin — "https means I cannot reach a plain-HTTP device", "a relative URL
 * reaches my own server" — is wrong there, and wrong in opposite directions.
 */

/** True inside the packaged Android app, false in any browser. */
export function isNative() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
}

/** Capacitor platform id: 'ios' | 'android' | 'web'. */
export function getPlatform() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null
  if (c && typeof c.getPlatform === 'function') return c.getPlatform()
  return 'web'
}

export function isIOS() {
  return getPlatform() === 'ios'
}

/**
 * Stamp the shell on <html> so CSS can tune iOS (nav density, glass opacity)
 * without JS branches in every component.
 */
export function applyPlatformDataset() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.platform = getPlatform()
}
