import { bridgeTransport } from './bridgeTransport'
import { mockTransport } from './mockTransport'

/**
 * Picks the right way to reach the controller:
 *   native  — Android APK, BLE straight from the device
 *   bridge  — desktop browser, through server.py
 *   mock    — no hardware at all (VITE_TRANSPORT=mock)
 *
 * @typedef {{address: string, name: string, rssi: number|null,
 *            hw: 'A'|'B'|null, isPinned: boolean}} Device
 * @typedef {{op:'power',on:boolean}
 *          |{op:'color',zone:number,r:number,g:number,b:number}
 *          |{op:'brightness',zone:number,level:number}
 *          |{op:'rgbMode',index:number}
 *          |{op:'symphony',kind:string,mode:number}} Intent
 */

let cached = null

function isNative() {
  // Capacitor injects this global; checking it avoids importing @capacitor/core
  // in a plain browser where the package may not be installed yet.
  const c = typeof window !== 'undefined' ? window.Capacitor : null
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform())
}

export function getTransport() {
  if (cached) return cached

  if (isNative()) {
    // Loaded lazily so the plugin import never runs in a browser
    cached = createNativeProxy()
  } else if (import.meta.env?.VITE_TRANSPORT === 'mock') {
    cached = mockTransport
  } else {
    cached = bridgeTransport
  }
  return cached
}

export function transportKind() {
  return getTransport().kind
}

/** Test seam. */
export function _setTransport(t) {
  cached = t
}

/**
 * Defers loading the BLE plugin until the first call, so a missing plugin can
 * never break app startup.
 */
function createNativeProxy() {
  let real = null
  const load = async () => {
    if (!real) real = (await import('./nativeBleTransport')).nativeBleTransport
    return real
  }
  let pendingDisconnectCb = null

  return {
    kind: 'native',
    isConnected: () => (real ? real.isConnected() : false),
    currentDevice: () => (real ? real.currentDevice() : null),
    onDisconnect(cb) {
      pendingDisconnectCb = cb
      if (real) real.onDisconnect(cb)
    },
    async scan(timeoutMs, onDevice) {
      const t = await load()
      if (pendingDisconnectCb) t.onDisconnect(pendingDisconnectCb)
      return t.scan(timeoutMs, onDevice)
    },
    async connect(address, hint) {
      const t = await load()
      if (pendingDisconnectCb) t.onDisconnect(pendingDisconnectCb)
      return t.connect(address, hint)
    },
    async disconnect() {
      const t = await load()
      return t.disconnect()
    },
    async send(bytes, intent) {
      const t = await load()
      return t.send(bytes, intent)
    },
  }
}
