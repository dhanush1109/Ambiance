import { controller } from '../services/controller'
import { useLightStore } from '../state/lightStore'
import { mixHex } from './color'

/**
 * A short fade-up when the car wakes: start warm and dim, arrive at whatever
 * the driver was last using. Steps are 300ms apart, comfortably inside the
 * command queue's 40ms floor.
 */

const STEPS = 8
const STEP_MS = 300
const START_HEX = '#3a241a'

export function runWelcome() {
  let cancelled = false
  let timer = null

  const target = useLightStore.getState().zones
  const t1 = target[1]
  const t2 = target[2]

  const done = (async () => {
    controller.setPower(true, { manual: false })
    controller.setBrightness(1, 1, { manual: false })
    controller.setBrightness(2, 1, { manual: false })

    for (let i = 1; i <= STEPS; i += 1) {
      if (cancelled) return
      await new Promise((r) => {
        timer = setTimeout(r, STEP_MS)
      })
      if (cancelled) return

      const t = i / STEPS
      controller.setColor(1, mixHex(START_HEX, t1.hex, t), { manual: false })
      controller.setColor(2, mixHex(START_HEX, t2.hex, t), { manual: false })
      controller.setBrightness(1, Math.round(1 + (t1.brightness - 1) * t), { manual: false })
      controller.setBrightness(2, Math.round(1 + (t2.brightness - 1) * t), { manual: false })
    }
  })()

  return {
    done,
    stop() {
      cancelled = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
