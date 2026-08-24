import { getTransport } from './transport'
import { enqueue, onQueueError, clearQueue } from './commandQueue'
import { payloadPower, payloadRgb, payloadBrightness, payloadRgbMode, payloadSpeed, uiSpeedToFirmware } from '../protocol/frames'
import { payloadSymphonyA } from '../protocol/symphony'
import { hexToRgb } from '../protocol/hex'
import { PINNED_DEVICE, ENFORCE_PIN, isPinnedAddress } from '../config/device'
import { useConnectionStore } from '../state/connectionStore'
import { useLightStore } from '../state/lightStore'
import { useUiStore } from '../state/uiStore'
import { writeJson, readJson } from './storage'
import { haptics } from './haptics'

/**
 * The only lighting API the UI touches.
 *
 * Each call updates the store immediately so the cabin map responds under your
 * thumb, then queues the actual write. The firmware never reports back, so the
 * store is always "what we last told it", never "what it says it is".
 */

const LAST_DROP_KEY = 'ambiance.lastDrop'
let inited = false

const conn = () => useConnectionStore.getState()
const light = () => useLightStore.getState()

function hw() {
  return conn().device?.hw ?? PINNED_DEVICE.hw ?? 'A'
}

/** Mark a human action so the ambient engine stands down. */
function manual(opts) {
  if (opts?.manual !== false) light().markManual()
}

function send(key, bytes, intent, opts) {
  if (!getTransport().isConnected()) return
  enqueue(key, () => getTransport().send(bytes, intent), opts)
}

/**
 * The box has two speed knobs: RGB page (`<3e0X>`) and Symphony page (`<0b0X>`).
 * Type A gets both so whichever family is running already has the new speed.
 * Type B has a single global 0x38 frame.
 */
function pushSpeed(level) {
  const lvl = uiSpeedToFirmware(level)
  const dialect = hw()
  send(
    'speed:rgb',
    payloadSpeed(dialect, lvl, 'rgb'),
    { op: 'speed', level: lvl, family: 'rgb' },
    { coalesce: true },
  )
  if (dialect === 'A') {
    send(
      'speed:symphony',
      payloadSpeed(dialect, lvl, 'symphony'),
      { op: 'speed', level: lvl, family: 'symphony' },
      { coalesce: true },
    )
  }
}

export const controller = {
  init() {
    if (inited) return
    inited = true

    // The two adverse choke points. Every failure path in the app funnels
    // through one of these, so the error haptic fires here and nowhere else —
    // putting it in individual catch blocks would double-buzz a single fault.
    getTransport().onDisconnect(async () => {
      await writeJson(LAST_DROP_KEY, { at: Date.now() })
      conn().setStatus('idle')
      conn().setDevice(null)
      clearQueue()
      haptics.error()
      useUiStore.getState().showToast('Controller disconnected', 'error')
    })

    onQueueError((err) => {
      conn().setError(err)
      haptics.error()
      useUiStore.getState().showToast('A command did not reach the controller', 'error')
    })
  },

  // ---------------------------------------------------------------- link

  async scan(timeoutMs = 12000) {
    conn().setStatus('scanning')
    conn().setError(null)
    try {
      const list = await getTransport().scan(timeoutMs, null)
      conn().setDevices(list)
      conn().setStatus(getTransport().isConnected() ? 'connected' : 'idle')
      return list
    } catch (err) {
      conn().setError(err)
      conn().setStatus('error')
      throw err
    }
  },

  /** Straight to the pinned MAC. No scan, no device list. */
  async connectPinned() {
    return controller.connect(PINNED_DEVICE.mac, {
      name: PINNED_DEVICE.name,
      hw: PINNED_DEVICE.hw,
    })
  },

  async connect(address, hint = {}) {
    if (ENFORCE_PIN && !isPinnedAddress(address)) {
      const err = new Error(
        `Ambiance is locked to ${PINNED_DEVICE.name} (${PINNED_DEVICE.mac}) and will not connect to another controller.`,
      )
      conn().setError(err)
      throw err
    }

    conn().setStatus('connecting')
    conn().setError(null)
    try {
      const device = await getTransport().connect(address, hint)
      conn().setDevice(device)
      conn().setStatus('connected')
      // The rarest event in the app gets the only multi-part pattern. This is
      // the single choke point for every connect path, manual or automatic.
      haptics.success()
      return device
    } catch (err) {
      conn().setError(err)
      conn().setStatus('error')
      throw err
    }
  },

  async disconnect() {
    clearQueue()
    await getTransport().disconnect()
    conn().setDevice(null)
    conn().setStatus('idle')
  },

  /** How long the link was down, for deciding whether to replay the welcome. */
  async lastDropAge() {
    const rec = await readJson(LAST_DROP_KEY, null)
    return rec?.at ? Date.now() - rec.at : Infinity
  },

  // ---------------------------------------------------------------- lights

  setPower(on, opts) {
    manual(opts)
    light().setPower(on)
    send('power', payloadPower(hw(), on), { op: 'power', on }, { coalesce: true })
  },

  setColor(zone, hex, opts) {
    manual(opts)
    light().setZoneColor(zone, hex)
    const { r, g, b } = hexToRgb(hex)
    send(`color:${zone}`, payloadRgb(hw(), r, g, b, zone), { op: 'color', zone, r, g, b })
  },

  setBrightness(zone, level, opts) {
    manual(opts)
    light().setZoneBrightness(zone, level)
    const l = Math.max(0, Math.min(9, Math.round(level)))
    send(`bright:${zone}`, payloadBrightness(hw(), l, zone), { op: 'brightness', zone, level: l })
  },

  setRgbMode(index, name, opts) {
    manual(opts)
    light().setActiveMode({ family: 'rgb', index, name: name || `RGB ${index}` })
    send('mode', payloadRgbMode(hw(), index), { op: 'rgbMode', index }, { coalesce: true })
    pushSpeed(light().speed)
  },

  setSymphony(kind, mode, name, opts) {
    manual(opts)
    light().setActiveMode({ family: kind, index: mode, name: name || `${kind} ${mode}` })
    send('mode', payloadSymphonyA(kind, mode), { op: 'symphony', kind, mode }, { coalesce: true })
    pushSpeed(light().speed)
  },

  setSpeed(level, opts) {
    manual(opts)
    const lvl = Math.max(1, Math.min(6, Math.round(Number(level) || 1)))
    light().setSpeed(lvl)
    pushSpeed(lvl)
  },

  /** Leave an animation by re-sending the current static colours. */
  returnToStatic(opts) {
    manual(opts)
    const l = light()
    l.clearMode()
    controller.setColor(1, l.zones[1].hex, { manual: false })
    controller.setColor(2, l.zones[2].hex, { manual: false })
  },

  /**
   * A mood is a pair: z1 = front cabin, z2 = handles & feet.
   * If a single zone is selected, only that half is written — picking
   * Handles & feet then tapping a mood must not repaint the dash.
   */
  applyMood(mood, opts) {
    manual(opts)
    const zone = opts?.zone ?? light().selectedZone
    const paint = (id, half) => {
      controller.setColor(id, half.hex, { manual: false })
      controller.setBrightness(id, half.brightness, { manual: false })
    }
    if (zone === 1) {
      paint(1, mood.z1)
    } else if (zone === 2) {
      paint(2, mood.z2)
    } else {
      paint(1, mood.z1)
      paint(2, mood.z2)
    }
    light().setMood(mood.id)
  },

  applyFavorite(fav, opts) {
    manual(opts)
    light().applyPair(fav.z1, fav.z2, null)
    controller.setColor(1, fav.z1.hex, { manual: false })
    controller.setBrightness(1, fav.z1.brightness, { manual: false })
    controller.setColor(2, fav.z2.hex, { manual: false })
    controller.setBrightness(2, fav.z2.brightness, { manual: false })
    if (fav.mode) {
      if (fav.mode.family === 'rgb') {
        controller.setRgbMode(fav.mode.index, fav.mode.name, { manual: false })
      } else {
        controller.setSymphony(fav.mode.family, fav.mode.index, fav.mode.name, { manual: false })
      }
    }
  },

  /** Put the cabin back the way the driver left it. */
  restoreLastState() {
    const l = light()
    controller.setPower(l.power, { manual: false })
    controller.setColor(1, l.zones[1].hex, { manual: false })
    controller.setBrightness(1, l.zones[1].brightness, { manual: false })
    controller.setColor(2, l.zones[2].hex, { manual: false })
    controller.setBrightness(2, l.zones[2].brightness, { manual: false })
  },
}
