import { api } from '../api'
import { PINNED_DEVICE, isPinnedAddress } from '../config/device'
import { classifyName } from '../protocol/frames'

/**
 * Desktop development transport: talks to server.py, which owns the BLE radio
 * through bleak.
 *
 * The bridge builds its own frames, so `send` ignores the byte array and
 * dispatches on the intent instead. Connect-by-MAC works unchanged because
 * server.py falls back to the raw address when it is not in its scan cache.
 */

let connected = false
let device = null
let disconnectCb = null

export const bridgeTransport = {
  kind: 'bridge',

  isConnected: () => connected,
  currentDevice: () => device,

  onDisconnect(cb) {
    disconnectCb = cb
  },

  async scan(_timeoutMs, onDevice) {
    const res = await api.scan()
    const list = (res.devices || []).map((d) => ({
      address: d.address,
      name: d.name || 'Unknown',
      rssi: d.rssi ?? null,
      hw: d.hw ?? classifyName(d.name),
      isPinned: isPinnedAddress(d.address),
    }))
    list.forEach((d) => onDevice?.(d))
    return list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return (b.rssi ?? -999) - (a.rssi ?? -999)
    })
  },

  async connect(address, hint = {}) {
    const res = await api.connect(address)
    if (!res.connected) throw new Error(res.error || 'The bridge could not open the link')
    connected = true
    device = {
      address: res.address || address,
      name: res.name || hint.name || PINNED_DEVICE.name,
      hw: res.hw || hint.hw || 'A',
    }
    return device
  },

  async disconnect() {
    connected = false
    device = null
    try {
      await api.disconnect()
    } catch {
      /* bridge already dropped it */
    }
  },

  /** Frames are rebuilt server-side, so route on the intent. */
  async send(_bytes, intent) {
    if (!intent) throw new Error('The bridge needs a command, not raw bytes')
    try {
      switch (intent.op) {
        case 'power':
          return await api.power(intent.on)
        case 'color': {
          const { r, g, b } = intent
          return await api.color(r, g, b, intent.zone)
        }
        case 'brightness':
          return await api.brightness(intent.level, intent.zone)
        case 'rgbMode':
          return await api.rgbMode(intent.index)
        case 'symphony':
          return await api.symphony(intent.kind, intent.mode)
        case 'speed':
          return await api.speed(intent.level, intent.family || 'both')
        default:
          throw new Error(`Unsupported command: ${intent.op}`)
      }
    } catch (err) {
      if (/not connected/i.test(err?.message ?? '')) {
        connected = false
        device = null
        disconnectCb?.()
      }
      throw err
    }
  },
}
