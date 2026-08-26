import Icon from './Icon'
import './cards.css'

/**
 * A saved look. Reordering is by up/down buttons: reachable by keyboard, and
 * easier than a drag with gloves on or on a moving road.
 */
export default function FavoriteCard({
  fav,
  disabled = false,
  isFirst = false,
  isLast = false,
  onApply,
  onRename,
  onRemove,
  onMove,
}) {
  return (
    <div className="favcard card">
      <button
        type="button"
        className="favcard-main pressable"
        disabled={disabled}
        onClick={() => onApply?.(fav)}
        aria-label={`Apply ${fav.name}`}
      >
        <span
          className="favcard-swatch"
          aria-hidden="true"
          style={{ '--c1': fav.z1.hex, '--c2': fav.z2.hex }}
        >
          <span className="favcard-c1" />
          <span className="favcard-c2" />
        </span>
        <span className="favcard-body">
          <span className="favcard-name">{fav.name}</span>
          <span className="favcard-meta">
            {fav.mode ? fav.mode.name : `${fav.z1.hex.toUpperCase()} · ${fav.z2.hex.toUpperCase()}`}
          </span>
        </span>
      </button>

      <div className="favcard-actions">
        <button
          type="button"
          className="favcard-btn pressable"
          onClick={() => onMove?.(fav.id, -1)}
          disabled={isFirst}
          aria-label={`Move ${fav.name} up`}
        >
          <Icon name="chevron-down" size={18} className="rot180" />
        </button>
        <button
          type="button"
          className="favcard-btn pressable"
          onClick={() => onMove?.(fav.id, 1)}
          disabled={isLast}
          aria-label={`Move ${fav.name} down`}
        >
          <Icon name="chevron-down" size={18} />
        </button>
        <button
          type="button"
          className="favcard-btn pressable"
          onClick={() => onRename?.(fav)}
          aria-label={`Rename ${fav.name}`}
        >
          <Icon name="palette" size={18} />
        </button>
        <button
          type="button"
          className="favcard-btn pressable favcard-danger"
          onClick={() => onRemove?.(fav)}
          aria-label={`Delete ${fav.name}`}
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
    </div>
  )
}
