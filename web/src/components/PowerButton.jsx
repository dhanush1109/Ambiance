import Icon from './Icon'
import './PowerButton.css'

/**
 * The one control that must be unmistakable in a dark car.
 *
 * On and off differ structurally — filled ring and halo versus a hollow
 * outline — rather than by colour alone, so the state reads at a glance and
 * still works for colour-blind users.
 */
export default function PowerButton({ on, busy = false, disabled = false, onToggle, size = 'md' }) {
  return (
    <button
      type="button"
      className={`power power-${size}${on ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}
      aria-pressed={on}
      aria-busy={busy || undefined}
      aria-label={on ? 'Turn cabin lights off' : 'Turn cabin lights on'}
      disabled={disabled}
      onClick={() => onToggle?.(!on)}
    >
      <span className="power-ring" aria-hidden="true" />
      {/* Keyed so the glyph and label re-mount on each state change and play
          their swap animation — the icon equivalent of a symbol replace. */}
      <span key={on ? 'on' : 'off'} className="power-glyph" aria-hidden="true">
        <Icon name="power" size={size === 'lg' ? 30 : 24} />
      </span>
      <span key={on ? 'text-on' : 'text-off'} className="power-text tick-swap">
        {on ? 'On' : 'Off'}
      </span>
    </button>
  )
}
