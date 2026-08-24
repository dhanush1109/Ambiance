import { controller } from '../services/controller'

/**
 * Cooler and brighter by day, warmer and dimmer after dark.
 * Applied once when it runs — this is not a loop.
 */

const THEMES = [
  { id: 'dawn', from: 5, to: 8, z1: { hex: '#ffb37a', brightness: 5 }, z2: { hex: '#c9743d', brightness: 3 } },
  { id: 'day', from: 8, to: 17, z1: { hex: '#cfe4ff', brightness: 7 }, z2: { hex: '#6f9ecb', brightness: 4 } },
  { id: 'dusk', from: 17, to: 20, z1: { hex: '#ff8a3d', brightness: 6 }, z2: { hex: '#a34fa8', brightness: 4 } },
  { id: 'night', from: 20, to: 29, z1: { hex: '#c2571f', brightness: 3 }, z2: { hex: '#5b2f8a', brightness: 2 } },
]

export function themeForHour(hour) {
  const h = hour < 5 ? hour + 24 : hour
  return THEMES.find((t) => h >= t.from && h < t.to) ?? THEMES[3]
}

export function applyTimeOfDay(date = new Date()) {
  const theme = themeForHour(date.getHours())
  controller.setColor(1, theme.z1.hex, { manual: false })
  controller.setBrightness(1, theme.z1.brightness, { manual: false })
  controller.setColor(2, theme.z2.hex, { manual: false })
  controller.setBrightness(2, theme.z2.brightness, { manual: false })
  return theme
}
