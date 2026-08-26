import { ZONES } from '../protocol/catalog'
import { haptics } from '../services/haptics'
import './ZoneChips.css'

/**
 * The three zones the controller actually exposes, with their honest piece
 * counts so the split is never a mystery.
 */
export default function ZoneChips({ value, onChange, disabled = false }) {
  // Drives the sliding selection pad. Clamped so an unrecognised zone leaves
  // the pad on the first chip rather than off the end of the row.
  const index = Math.max(0, ZONES.findIndex((z) => z.id === value))

  return (
    <div
      className="zonechips"
      role="group"
      aria-label="Light zone"
      style={{ '--zone-i': index }}
    >
      <span className="zonechip-pill" aria-hidden="true" />
      {ZONES.map((z) => {
        const active = value === z.id
        return (
          <button
            key={z.id}
            type="button"
            className={`chip zonechip pressable${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              haptics.tick()
              onChange?.(z.id)
            }}
          >
            <span className="zonechip-name">{z.name}</span>
            <span className="zonechip-count tnum">{z.pieces}</span>
          </button>
        )
      })}
    </div>
  )
}
