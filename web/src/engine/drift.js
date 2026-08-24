import { controller } from '../services/controller'
import { useLightStore } from '../state/lightStore'
import { rotateHue } from './color'

/**
 * Relax mode: nudge both zones a few degrees around the hue wheel every few
 * seconds. Two writes per tick, so even at the fastest setting this is a
 * rounding error against the queue's throughput.
 */

const DEFAULT_TICK_MS = 4000
const DEGREES_PER_TICK = 7

export function createDrift({ tickMs = DEFAULT_TICK_MS, degrees = DEGREES_PER_TICK } = {}) {
  let timer = null
  const period = Math.max(2000, Math.min(8000, tickMs))

  const tick = () => {
    const { zones } = useLightStore.getState()
    controller.setColor(1, rotateHue(zones[1].hex, degrees), { manual: false })
    controller.setColor(2, rotateHue(zones[2].hex, degrees), { manual: false })
  }

  return {
    name: 'drift',
    start() {
      if (timer) return
      timer = setInterval(tick, period)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}
