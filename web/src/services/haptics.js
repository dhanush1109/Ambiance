import { useSettingsStore } from '../state/settingsStore'
import { isNative } from './platform'

/**
 * A small vibration vocabulary.
 *
 * Three rules from the game-feel discipline:
 *
 *  1. **Feedback scales with rarity.** Selecting a zone happens constantly and
 *     gets the faintest tick; connecting to the car happens once a journey and
 *     gets a multi-part pattern. If the rare event felt like the common
 *     one, the app would have no punctuation.
 *
 *  2. **Adverse events feel different, not just bigger.** Success is a short
 *     rising triple; error is a heavy, symmetric double-thump. They should be
 *     tellable apart in a pocket without looking.
 *
 *  3. **Single owner.** These fire from press handlers, from the one moment a
 *     connection succeeds, and from the two moments something goes wrong —
 *     never from the command layer, and never from the ambient engine.
 *     Otherwise a colour drag would buzz sixty times a second and drift mode
 *     would tap away on its own in the dark.
 *
 * On native (especially iOS) we use @capacitor/haptics / Core Haptics.
 * `navigator.vibrate` is a no-op in WKWebView, so the web path alone left
 * iPhones silent.
 */

const TICK = 8
const TAP = 15
const SUCCESS = [10, 30, 20]
const ERROR = [30, 60, 30]

let pluginPromise = null

function loadPlugin() {
  if (!pluginPromise) {
    pluginPromise = import('@capacitor/haptics')
      .then((m) => m)
      .catch(() => null)
  }
  return pluginPromise
}

function webBuzz(pattern) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some browsers throw when the page is not user-activated.
  }
}

async function nativeBuzz(kind) {
  const mod = await loadPlugin()
  if (!mod?.Haptics) {
    webBuzz(kind === 'tick' ? TICK : kind === 'tap' ? TAP : kind === 'success' ? SUCCESS : ERROR)
    return
  }
  const { Haptics, ImpactStyle, NotificationType } = mod
  try {
    if (kind === 'tick') await Haptics.impact({ style: ImpactStyle.Light })
    else if (kind === 'tap') await Haptics.impact({ style: ImpactStyle.Medium })
    else if (kind === 'success') await Haptics.notification({ type: NotificationType.Success })
    else if (kind === 'error') await Haptics.notification({ type: NotificationType.Error })
  } catch {
    // Plugin refused (simulator, muted, etc.) — silent is fine.
  }
}

function fire(kind, webPattern) {
  if (!useSettingsStore.getState().haptics) return
  if (isNative()) {
    void nativeBuzz(kind)
    return
  }
  webBuzz(webPattern)
}

export const haptics = {
  /** Lightest touch: selection changed. */
  tick: () => fire('tick', TICK),
  /** A setting was applied. */
  tap: () => fire('tap', TAP),
  /** The rarest good event in the app: the car is connected. */
  success: () => fire('success', SUCCESS),
  /** The link dropped, or a command never landed. */
  error: () => fire('error', ERROR),
}

/**
 * Rate-limits a haptic so a continuous drag feels like detents rather than a
 * buzz. Lives here rather than in the component so the timing discipline sits
 * with the vocabulary — and so it can be tested without rendering anything.
 *
 * @param {() => void} fn
 * @param {number} gapMs minimum spacing between firings
 */
export function createDetent(fn, gapMs = 80) {
  let last = 0
  return () => {
    const now = Date.now()
    if (now - last < gapMs) return
    last = now
    fn()
  }
}
