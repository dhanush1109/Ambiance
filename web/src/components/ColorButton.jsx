import Icon from './Icon'
import './ColorButton.css'

/**
 * Opens the colour sheet. A round swatch of the live colour, so the button
 * itself previews what tapping it will let you change.
 */
export default function ColorButton({ hex, disabled = false, open = false, onPress }) {
  return (
    <button
      type="button"
      className={`colorbtn pressable${open ? ' is-open' : ''}`}
      style={{ '--c': hex }}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Colour, currently ${hex.toUpperCase()}`}
      onClick={onPress}
    >
      <span className="colorbtn-swatch" aria-hidden="true" />
      <Icon name="palette" size={18} className="colorbtn-icon" />
    </button>
  )
}
