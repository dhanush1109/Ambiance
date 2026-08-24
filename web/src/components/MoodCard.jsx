import { useState } from 'react'
import Icon from './Icon'
import MiniCar from './MiniCar'
import { hexToRgba } from '../protocol/hex'
import './cards.css'

/**
 * A mood is two coordinated colours — cabin and footwells. Rather than abstract
 * swatches, the card previews the mood on the actual car, so you can see where
 * each colour lands before applying it.
 */
export default function MoodCard({ mood, active = false, disabled = false, onPress }) {
  // Bumping this remounts the sheen, so the sweep replays on every apply —
  // not just the first time the card becomes active.
  const [flash, setFlash] = useState(0)

  return (
    <button
      type="button"
      className={`moodcard card card-interactive${active ? ' card-active' : ''}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={() => {
        setFlash((n) => n + 1)
        onPress?.(mood)
      }}
    >
      {flash > 0 ? <span key={flash} className="card-sheen" aria-hidden="true" /> : null}
      <span
        className="moodcard-swatch"
        aria-hidden="true"
        style={{
          '--c1': mood.z1.hex,
          '--c2': mood.z2.hex,
          background: `radial-gradient(ellipse 70% 90% at 32% 50%, ${hexToRgba(mood.z1.hex, 0.55)}, transparent 70%), radial-gradient(ellipse 60% 90% at 78% 50%, ${hexToRgba(mood.z2.hex, 0.42)}, transparent 70%), #0b0d12`,
        }}
      >
        <MiniCar
          z1={mood.z1.hex}
          z2={mood.z2.hex}
          b1={mood.z1.brightness}
          b2={mood.z2.brightness}
          className="moodcard-minicar"
        />
      </span>

      <span className="moodcard-body">
        <span className="moodcard-name">
          {mood.name}
          {active ? <Icon name="check" size={16} className="moodcard-check" /> : null}
        </span>
        <span className="moodcard-sub">{mood.subtitle}</span>
      </span>
    </button>
  )
}
