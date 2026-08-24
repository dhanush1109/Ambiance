import { ZONES } from '../protocol/catalog'
import { haptics } from '../services/haptics'
import './ZoneChips.css'

/**
 * The three zones the controller actually exposes, with their honest piece
 * counts so the split is never a mystery.
 */
export default function ZoneChips({ value, onChange, disabled = false }) {
  return (
    <div className="zonechips" role="group" aria-label="Light zone">
      {ZONES.map((z) => {
        const active = value === z.id
        return (
          <button
            key={z.id}
            type="button"
            className={`chip zonechip${active ? ' is-active' : ''}`}
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
