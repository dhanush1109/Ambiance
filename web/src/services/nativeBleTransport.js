import { SERVICE_UUID, CHAR_FFE1, CHAR_FFE2, classifyName, writeUuidFor } from '../protocol/frames'
import { toDataView } from '../protocol/hex'
import { PINNED_DEVICE, isPinnedAddress, normalizeMac } from '../config/device'

/**
 * Android BLE via @capacitor-community/bluetooth-le.
 *
 * Two hard-won details from the working Python client:
 *
 *  - Scanning is UNFILTERED and matched by name in JS. Filtering by service
 *    FFE0 looks tidier but the ATW advertisement does not always carry the
 *    service UUID, and Android would then return nothing at all.
 *
 *  - The write path tries both characteristics and both write modes, caching
 *    whichever pair works. Mirrors CardiController.send in cardi_ble.py.
 */

let BleClient = null
let initialised = false
let connectedId = null
let connectedHw = 'A'
let connectedName = ''
let winner = null // { uuid, withResponse }
let disconnectCb = null

async function client() {
  if (BleClient) return BleClient
  const mod = await import('@capacitor-community/bluetooth-le')
  BleClient = mod.BleClient
  return BleClient
}

async function ensureInit() {
  if (initialised) return
  const ble = await client()
  await ble.initialize({ androidNeverForLocation: true })
  initialised = true
}

export const nativeBleTransport = {
  kind: 'native',

  isConnected: () => connectedId !== null,
  currentDevice: () =>
    connectedId ? { address: connectedId, name: connectedName, hw: connectedHw } : null,

  onDisconnect(cb) {
    disconnectCb = cb
  },

  async scan(timeoutMs = 12000, onDevice) {
    await ensureInit()
    const ble = await client()
    const found = new Map()

    await ble.requestLEScan({ allowDuplicates: false }, (result) => {
      const name = result?.localName || result?.device?.name || ''
      const address = result?.device?.deviceId || ''
      if (!address) return
      const hw = classifyName(name)
      const entry = {
        address,
        name: name || 'Unknown',
        rssi: typeof result?.rssi === 'number' ? result.rssi : null,
        hw,
        isPinned: isPinnedAddress(address),
      }
      found.set(address, entry)
      onDevice?.(entry)
    })

    await new Promise((r) => setTimeout(r, timeoutMs))
    try {
      await ble.stopLEScan()
    } catch {
      /* already stopped */
    }

    // Our controller first, then anything else that looks like a Cardi box
    return [...found.values()].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      if (!!a.hw !== !!b.hw) return a.hw ? -1 : 1
      return (b.rssi ?? -999) - (a.rssi ?? -999)
    })
  },

  /** Connects straight to a MAC — no scan required. */
  async connect(address, hint = {}) {
    await ensureInit()
    const ble = await client()
    const id = normalizeMac(address) === normalizeMac(PINNED_DEVICE.mac) ? PINNED_DEVICE.mac : address

    await ble.connect(id, () => {
      connectedId = null
      winner = null
      disconnectCb?.()
    }, { timeout: 20000 })

    connectedId = id
    connectedName = hint.name || PINNED_DEVICE.name
    connectedHw = hint.hw || classifyName(connectedName) || 'A'
    winner = null // re-probe the write path on every fresh link
    return { address: id, name: connectedName, hw: connectedHw }
  },

  async disconnect() {
    const id = connectedId
    connectedId = null
    winner = null
    if (!id) return
    try {
      const ble = await client()
      await ble.disconnect(id)
    } catch {
      /* already gone */
    }
  },

  async send(bytes) {
    if (!connectedId) throw new Error('Not connected')
    const ble = await client()
    const view = toDataView(bytes)

    const write = async (uuid, withResponse) => {
      if (withResponse) await ble.write(connectedId, SERVICE_UUID, uuid, view)
      else await ble.writeWithoutResponse(connectedId, SERVICE_UUID, uuid, view)
    }

    if (winner) {
      await write(winner.uuid, winner.withResponse)
      return
    }

    const primary = writeUuidFor(connectedHw)
    const fallback = primary === CHAR_FFE2 ? CHAR_FFE1 : CHAR_FFE2
    let last = null

    for (const uuid of [primary, fallback]) {
      for (const withResponse of [true, false]) {
        try {
          await write(uuid, withResponse)
          winner = { uuid, withResponse }
          return
        } catch (err) {
          last = err
        }
      }
    }
    throw new Error(`GATT write failed: ${last?.message ?? last}`)
  },
}
