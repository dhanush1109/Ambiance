import { useRef } from 'react'
import { haptics, createDetent } from '../services/haptics'
import './Brightness.css'

/**
 * A tick per step crossed, so a drag feels like a detented dial rather than a
 * smooth slider — the firmware has exactly ten stops and the hand should know
 * it. Rate-limited, because a fast sweep would otherwise be one long buzz.
 *
 * Only the pointer and keyboard handlers call this. Programmatic changes —
 * applying a mood, restoring state on connect — arrive as props and never
 * reach these paths, so they stay silent by construction rather than by care.
 */
const detentTick = createDetent(() => haptics.tick(), 80)

/**
 * Discrete steps matching the firmware. Brightness is 0–9; animation
 * speed reuses this control as 1–6.
 */
export default function Brightness({
  value = 5,
  min = 0,
  max = 9,
  label = 'Brightness',
  onChange,
  onCommit,
  disabled = false,
}) {
  const ref = useRef(null)
  const dragging = useRef(false)

  const levelFrom = (e) => {
    const el = ref.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    return min + Math.round(ratio * (max - min))
  }

  const start = (e) => {
    if (disabled) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragging.current = true
    const l = levelFrom(e)
    if (l !== null && l !== value) {
      detentTick()
      onChange?.(l)
    }
  }

  const move = (e) => {
    if (!dragging.current) return
    const l = levelFrom(e)
    if (l !== null && l !== value) {
      detentTick()
      onChange?.(l)
    }
  }

  const end = (e) => {
    if (!dragging.current) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragging.current = false
    onCommit?.(value)
  }

  const key = (e) => {
    let next = null
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(min, value - 1)
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(max, value + 1)
    if (e.key === 'Home') next = min
    if (e.key === 'End') next = max
    if (next === null) return
    e.preventDefault()
    if (next !== value) detentTick()
    onChange?.(next)
    onCommit?.(next)
  }

  return (
    <div className="brightness">
      <div className="brightness-head">
        <span className="brightness-label caps-label">{label}</span>
        {/* keyed so the number ticks over rather than snapping */}
        <span key={value} className="brightness-value tnum tick-swap">
          {value}/{max}
        </span>
      </div>

      <div
        ref={ref}
        className={`brightness-track${disabled ? ' is-disabled' : ''}`}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${label} ${value} of ${max}`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={key}
      >
        {Array.from({ length: max - min + 1 }, (_, i) => (
          <span
            key={i}
            className={`brightness-seg${i <= value - min ? ' is-lit' : ''}`}
            style={{ '--i': i }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
}
