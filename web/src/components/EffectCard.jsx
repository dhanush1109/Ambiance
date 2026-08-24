import { useState } from 'react'
import Icon from './Icon'
import { colorsFor, gradientFor, motionFor } from '../data/effectGradients'
import './cards.css'

/**
 * One firmware animation. The gradient is parsed from the mode's own name, so
 * "Red-Blue Chasing" previews red and blue — an honest hint, not a simulation.
 */
export default function EffectCard({ index, name, active = false, disabled = false, onPress }) {
  const motion = motionFor(name)
  const colors = colorsFor(name)
  const [flash, setFlash] = useState(0)

  return (
    <button
      type="button"
      className={`effectcard card card-interactive${active ? ' card-active' : ''}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => {
        setFlash((n) => n + 1)
        onPress?.({ index, name })
      }}
    >
      {flash > 0 ? <span key={flash} className="card-sheen" aria-hidden="true" /> : null}

      {/* The gradient, its badges, and a scrim that lets the strip meet the
          label row instead of colliding with it. */}
      <span className="effectcard-art">
        <span
          className={`effectcard-strip motion-${motion}`}
          aria-hidden="true"
          style={{
            backgroundColor: colors[0],
            backgroundImage: gradientFor(name),
          }}
        />
        {/* Plain translucent fill, not glass — this sits on content */}
        <span className="effectcard-index tnum" aria-hidden="true">
          {index}
        </span>
        {active ? (
          <span className="effectcard-check">
            <Icon name="check" size={14} />
          </span>
        ) : null}
      </span>

      <span className="effectcard-body">
        <span className="effectcard-name">{name}</span>
      </span>
    </button>
  )
}
