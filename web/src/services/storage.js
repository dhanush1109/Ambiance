/**
 * Async key/value store: Capacitor Preferences on device, localStorage in a
 * browser. Shaped for zustand's persist middleware.
 *
 * Every method swallows failure. Private-mode browsers, cleared site data and a
 * missing plugin must degrade to "no saved settings", never to a crash.
 */

let prefsBox = null // wrapper object, never the bare plugin proxy
let prefsTried = false

function isNative() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
}

/**
 * Returns { plugin } or null.
 *
 * Two things matter here:
 *  - Only load Preferences on a real device. Its web shim throws UNIMPLEMENTED,
 *    so on desktop we want localStorage, not a broken plugin.
 *  - Never return the plugin proxy directly from an async function. Awaiting a
 *    value makes JS read `.then` on it, and the Capacitor proxy turns that
 *    property access into a thrown UNIMPLEMENTED error. Boxing it avoids that.
 */
async function preferences() {
  if (prefsTried) return prefsBox
  prefsTried = true
  if (!isNative()) return null
  try {
    const mod = await import('@capacitor/preferences')
    prefsBox = mod?.Preferences ? { plugin: mod.Preferences } : null
  } catch {
    prefsBox = null
  }
  return prefsBox
}

const memory = new Map()

function localGet(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return memory.has(key) ? memory.get(key) : null
  }
}

function localSet(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    memory.set(key, value)
  }
}

function localRemove(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    memory.delete(key)
  }
}

export const storage = {
  async getItem(key) {
    const box = await preferences()
    if (box) {
      try {
        const res = await box.plugin.get({ key })
        return res?.value ?? null
      } catch {
        /* fall through to web storage */
      }
    }
    return localGet(key)
  },

  async setItem(key, value) {
    const box = await preferences()
    if (box) {
      try {
        await box.plugin.set({ key, value: String(value) })
        return
      } catch {
        /* fall through */
      }
    }
    localSet(key, String(value))
  },

  async removeItem(key) {
    const box = await preferences()
    if (box) {
      try {
        await box.plugin.remove({ key })
        return
      } catch {
        /* fall through */
      }
    }
    localRemove(key)
  },
}

/** Small helpers for things outside zustand (last device, last drop time). */
export async function readJson(key, fallback = null) {
  const raw = await storage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export async function writeJson(key, value) {
  await storage.setItem(key, JSON.stringify(value))
}
