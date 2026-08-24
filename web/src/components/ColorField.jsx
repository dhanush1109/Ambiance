import { useCallback, useRef, useState, useEffect } from 'react'
// One implementation of the colour maths, shared with the ambient engine.
// This file used to carry its own copy, which had lightness on a 0-1 scale
// while the rest of the app used 0-100 — it produced strings like
// "#-3c25cc53d61", and hexToRgb throws on those, so dragging the picker
// silently failed to change the lights at all.
import { hslToHex, hexToHsl as hexToHslRaw } from '../engine/color'
import './ColorField.css'

/**
 * Hue rail + saturation/lightness pad.
 *
 * Pointer events throughout, with setPointerCapture — this app is used with a
 * thumb in a parked car, and the previous version's mouse-only handlers simply
 * did not work on touch. Arrow keys drive both axes so choosing a colour never
 * requires a drag.
 */

/** Non-finite input collapses to the low bound rather than poisoning the maths
 *  — a NaN here would surface as a colour string that hexToRgb refuses. */
const clamp = (n, lo, hi) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo)

/** One-tap classics. Reaching a good colour should not require a drag. */
const PRESETS = [
  ['Amber', '#ff8a3d'],
  ['Ice blue', '#9fe4ff'],
  ['Rose', '#ff6fa5'],
  ['Violet', '#a341ff'],
  ['Green', '#63e6a4'],
  ['Warm white', '#fff4e6'],
  ['Gold', '#d8b34a'],
  ['Red', '#ff2436'],
]

/** Whole numbers, because the pad and rail work in integer steps. */
function hexToHsl(hex) {
  const { h, s, l } = hexToHslRaw(hex)
  return { h: Math.round(h), s: Math.round(s), l: Math.round(l) }
}

export default function ColorField({ hex, onChange, onCommit, disabled = false }) {
  const [hsl, setHsl] = useState(() => hexToHsl(hex))
  const dragging = useRef(null)
  const padRef = useRef(null)
  const hueRef = useRef(null)

  // Follow external changes (a mood applied, a favourite restored) unless the
  // user is mid-drag, which would fight their thumb.
  useEffect(() => {
    if (dragging.current) return
    const next = hexToHsl(hex)
    setHsl((cur) => (cur.h === next.h && cur.s === next.s && cur.l === next.l ? cur : next))
  }, [hex])

  const emit = useCallback(
    (next, commit) => {
      const value = hslToHex(next.h, next.s, next.l)
      // Last line of defence: the controller throws on a malformed colour, so
      // never hand one out even if something upstream went wrong.
      if (!/^#[0-9a-f]{6}$/i.test(value)) return
      setHsl(next)
      onChange?.(value)
      if (commit) onCommit?.(value)
    },
    [onChange, onCommit],
  )

  const fromPad = (e) => {
    const el = padRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      s: Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 100),
      l: Math.round(96 - clamp((e.clientY - r.top) / r.height, 0, 1) * 88),
    }
  }

  const fromHue = (e) => {
    const el = hueRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 360)
  }

  const start = (kind) => (e) => {
    if (disabled) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragging.current = kind
    move(e)
  }

  const move = (e) => {
    if (!dragging.current) return
    if (dragging.current === 'pad') {
      const p = fromPad(e)
      if (p) emit({ ...hsl, ...p }, false)
    } else {
      const h = fromHue(e)
      if (h !== null) emit({ ...hsl, h }, false)
    }
  }

  const end = (e) => {
    if (!dragging.current) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragging.current = null
    onCommit?.(hslToHex(hsl.h, hsl.s, hsl.l))
  }

  const keyPad = (e) => {
    const step = e.shiftKey ? 10 : 3
    let next = null
    if (e.key === 'ArrowLeft') next = { ...hsl, s: clamp(hsl.s - step, 0, 100) }
    if (e.key === 'ArrowRight') next = { ...hsl, s: clamp(hsl.s + step, 0, 100) }
    if (e.key === 'ArrowUp') next = { ...hsl, l: clamp(hsl.l + step, 8, 96) }
    if (e.key === 'ArrowDown') next = { ...hsl, l: clamp(hsl.l - step, 8, 96) }
    if (!next) return
    e.preventDefault()
    emit(next, true)
  }

  const keyHue = (e) => {
    const step = e.shiftKey ? 20 : 5
    let h = null
    if (e.key === 'ArrowLeft') h = (hsl.h - step + 360) % 360
    if (e.key === 'ArrowRight') h = (hsl.h + step) % 360
    if (h === null) return
    e.preventDefault()
    emit({ ...hsl, h }, true)
  }

  const current = hslToHex(hsl.h, hsl.s, hsl.l)

  return (
    <div className={`colorfield${disabled ? ' is-disabled' : ''}`}>
      <div className="colorfield-presets" role="group" aria-label="Preset colours">
        {PRESETS.map(([name, value]) => (
          <button
            key={value}
            type="button"
            className={`colorfield-preset${
              value.toLowerCase() === (hex || '').toLowerCase() ? ' is-current' : ''
            }`}
            style={{ '--c': value }}
            aria-label={`Set colour to ${name}`}
            disabled={disabled}
            onClick={() => {
              onChange?.(value)
              onCommit?.(value)
            }}
          />
        ))}
      </div>

      <div
        ref={padRef}
        className="colorfield-pad"
        role="application"
        aria-label={`Saturation and lightness. Current colour ${current}`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        style={{ '--hue': hsl.h }}
        onPointerDown={start('pad')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={keyPad}
      >
        {/* The pad clips its gradient, so the handle is clamped half its own
            width from each edge — otherwise it is cut in half at the extremes.
            Only the drawn position is clamped; the colour value is untouched. */}
        <span
          className="colorfield-thumb"
          aria-hidden="true"
          style={{
            left: `clamp(13px, ${hsl.s}%, calc(100% - 13px))`,
            top: `clamp(13px, ${((96 - hsl.l) / 88) * 100}%, calc(100% - 13px))`,
            background: current,
          }}
        />
      </div>

      <div
        ref={hueRef}
        className="colorfield-hue"
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={hsl.h}
        aria-valuetext={`${hsl.h} degrees`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={start('hue')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={keyHue}
      >
        <span
          className="colorfield-huethumb"
          aria-hidden="true"
          style={{
            left: `clamp(15px, ${(hsl.h / 360) * 100}%, calc(100% - 15px))`,
            background: hslToHex(hsl.h, 100, 50),
          }}
        />
      </div>

      <output className="colorfield-value tnum">{current.toUpperCase()}</output>
    </div>
  )
}
