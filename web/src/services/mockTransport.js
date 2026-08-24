import { bytesToHex } from '../protocol/hex'
import { PINNED_DEVICE } from '../config/device'

/**
 * Pretend controller for UI work with no car nearby.
 * Enable with VITE_TRANSPORT=mock. Records every frame so behaviour can be
 * asserted in tests.
 */

let connected = false
let disconnectCb = null

/** @type {Array<{ts: number, hex: string, intent: any}>} */
export const sentLog = []

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export const mockTransport = {
  kind: 'mock',

  isConnected: () => connected,
  currentDevice: () =>
    connected ? { address: PINNED_DEVICE.mac, name: PINNED_DEVICE.name, hw: 'A' } : null,

  onDisconnect(cb) {
    disconnectCb = cb
  },

  async scan(_timeoutMs, onDevice) {
    await wait(500)
    const list = [
      { address: PINNED_DEVICE.mac, name: PINNED_DEVICE.name, rssi: -58, hw: 'A', isPinned: true },
      { address: 'AA:BB:CC:DD:EE:01', name: 'CD-AMB-DEMO', rssi: -77, hw: 'B', isPinned: false },
      { address: 'AA:BB:CC:DD:EE:02', name: 'Unknown', rssi: -91, hw: null, isPinned: false },
    ]
    list.forEach((d) => onDevice?.(d))
    return list
  },

  async connect(address, hint = {}) {
    await wait(320)
    connected = true
    return { address, name: hint.name || PINNED_DEVICE.name, hw: hint.hw || 'A' }
  },

  async disconnect() {
    connected = false
  },

  async send(bytes, intent) {
    if (!connected) throw new Error('Not connected')
    await wait(12)
    sentLog.push({ ts: Date.now(), hex: bytes ? bytesToHex(bytes) : '', intent })
    if (sentLog.length > 500) sentLog.shift()
  },

  /** Test helper: pretend the link dropped. */
  simulateDrop() {
    connected = false
    disconnectCb?.()
  },
}
