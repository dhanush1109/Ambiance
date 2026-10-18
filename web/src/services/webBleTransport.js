import { SERVICE_UUID, CHAR_FFE1, CHAR_FFE2, classifyName, writeUuidFor } from '../protocol/frames'
import { PINNED_DEVICE, ENFORCE_PIN } from '../config/device'

/**
 * Browser Web Bluetooth. Chrome/Edge/Android, and iOS Bluefy.
 *
 * Safari (including a Home Screen web app) has no Web Bluetooth, so this
 * module is never selected there. The chooser is required; iOS never
 * exposes a MAC.
 */

let device = null
let server = null
let connectedHw = 'A'
let connectedName = ''
let winner = null // { uuid, withResponse }
let disconnectCb = null

function onGattDrop() {
  device = null
  server = null
  winner = null
  disconnectCb?.()
}

async function pickDevice() {
  if (!navigator.bluetooth) {
    throw new Error(
      'This browser cannot talk Bluetooth. On iPhone, add Ambiance to the Home Screen for the app look. To drive the lights, use the Android app or open this site in Bluefy.',
    )
  }
  return navigator.bluetooth.requestDevice({
    filters: [{ name: PINNED_DEVICE.name }, { namePrefix: 'ATW-' }],
    optionalServices: [SERVICE_UUID],
  })
}

async function writeChar(uuid, withResponse, bytes) {
  const service = await server.getPrimaryService(SERVICE_UUID)
  const char = await service.getCharacteristic(uuid)
  const payload = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
  if (withResponse) {
    if (char.writeValueWithResponse) await char.writeValueWithResponse(payload)
    else await char.writeValue(payload)
  } else if (char.writeValueWithoutResponse) {
    await char.writeValueWithoutResponse(payload)
  } else {
    await char.writeValue(payload)
  }
}

export const webBleTransport = {
  kind: 'web',

  isConnected: () => !!(server && server.connected),
  currentDevice: () =>
    server?.connected
      ? { address: PINNED_DEVICE.mac, name: connectedName, hw: connectedHw }
      : null,

  onDisconnect(cb) {
    disconnectCb = cb
  },

  async scan() {
    const picked = await pickDevice()
    const hw = classifyName(picked.name)
    return [
      {
        address: picked.id,
        name: picked.name || 'Unknown',
        rssi: null,
        hw,
        isPinned: picked.name === PINNED_DEVICE.name,
      },
    ]
  },

  async connect(_address, hint = {}) {
    const picked = await pickDevice()
    if (ENFORCE_PIN && picked.name && picked.name !== PINNED_DEVICE.name) {
      throw new Error(
        `Ambiance is locked to ${PINNED_DEVICE.name} and will not connect to another controller.`,
      )
    }
    if (!picked.gatt) throw new Error('This device has no GATT connection')

    if (device) {
      try {
        device.removeEventListener('gattserverdisconnected', onGattDrop)
      } catch {
        /* ignore */
      }
    }

    device = picked
    device.addEventListener('gattserverdisconnected', onGattDrop)
    server = await device.gatt.connect()
    connectedName = picked.name || hint.name || PINNED_DEVICE.name
    connectedHw = hint.hw || classifyName(connectedName) || 'A'
    winner = null
    return { address: PINNED_DEVICE.mac, name: connectedName, hw: connectedHw }
  },

  async disconnect() {
    const current = device
    device = null
    server = null
    winner = null
    if (!current) return
    try {
      current.removeEventListener('gattserverdisconnected', onGattDrop)
      current.gatt?.disconnect()
    } catch {
      /* already gone */
    }
  },

  async send(bytes) {
    if (!server?.connected) throw new Error('Not connected')

    if (winner) {
      await writeChar(winner.uuid, winner.withResponse, bytes)
      return
    }

    const primary = writeUuidFor(connectedHw)
    const fallback = primary === CHAR_FFE2 ? CHAR_FFE1 : CHAR_FFE2
    let last = null

    for (const uuid of [primary, fallback]) {
      for (const withResponse of [true, false]) {
        try {
          await writeChar(uuid, withResponse, bytes)
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
