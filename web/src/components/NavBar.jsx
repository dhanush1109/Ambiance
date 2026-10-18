import Icon from './Icon'
import { useUiStore, TABS } from '../state/uiStore'
import './NavBar.css'

/**
 * The app's navigation layer — one of only three glass surfaces.
 * Bottom bar on a phone, vertical rail on the tablet.
 * Only the active item is tinted; tinting everything would flatten the hierarchy.
 */
export default function NavBar({ variant = 'bottom' }) {
  const tab = useUiStore((s) => s.tab)
  const setTab = useUiStore((s) => s.setTab)
  const index = Math.max(0, TABS.findIndex((t) => t.id === tab))

  return (
    <nav
      className={`nav glass-nav nav-${variant}`}
      aria-label="Main"
    >
      {/* --nav-n so the sliding indicator's width tracks the real tab count
          instead of a number hard-coded in the stylesheet. */}
      <ul className="nav-list" style={{ '--nav-i': index, '--nav-n': TABS.length }}>
        {/* One indicator that slides between tabs, rather than a pad that
            blinks on and off under each one. */}
        <span className="nav-pill" aria-hidden="true" />
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <li key={t.id}>
              <button
                type="button"
                className={`nav-item pressable${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} size={22} filled={active} />
                <span className="nav-label">{t.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
