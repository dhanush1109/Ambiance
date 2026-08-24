/** Colour maths for the ambient effects. */

export function hexToRgbTriple(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '')
  if (!m) return [255, 138, 61]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export function tripleToHex([r, g, b]) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Straight RGB blend — fine for a fade from one colour to another. */
export function mixHex(a, b, t) {
  const [r1, g1, b1] = hexToRgbTriple(a)
  const [r2, g2, b2] = hexToRgbTriple(b)
  return tripleToHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t])
}

export function hexToHsl(hex) {
  const [r0, g0, b0] = hexToRgbTriple(hex)
  const r = r0 / 255
  const g = g0 / 255
  const b = b0 / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = Math.round(h * 60)
  if (h < 0) h += 360
  const l = (max + min) / 2
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  return { h, s: s * 100, l: l * 100 }
}

export function hslToHex(h, s, l) {
  const a = (s * Math.min(l, 100 - l)) / 10000
  const f = (n) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
    return Math.round(255 * c)
  }
  return tripleToHex([f(0), f(8), f(4)])
}

/**
 * Walk the hue wheel, keeping saturation and lightness.
 * Interpolating in HSL rather than RGB is what stops a red-to-blue drift
 * passing through grey.
 */
export function rotateHue(hex, degrees) {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex((h + degrees + 360) % 360, s, l)
}
