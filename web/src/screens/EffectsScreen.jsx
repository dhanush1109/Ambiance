import { useMemo, useState, useDeferredValue } from 'react'
import EffectCard from '../components/EffectCard'
import Brightness from '../components/Brightness'
import Icon from '../components/Icon'
import { FAMILIES, modesFor } from '../protocol/catalog'
import { useLightStore } from '../state/lightStore'
import { useConnectionStore, isConnected } from '../state/connectionStore'
import { useUiStore } from '../state/uiStore'
import { controller } from '../services/controller'
import { haptics } from '../services/haptics'
import './screens.css'

const BLURB = {
  rgb: 'The controller’s built-in RGB page — gradients, flashes, jumps and breathing.',
  dazzle: 'Flowing, chasing and curtain patterns that sweep along the strips.',
  music: 'The controller’s own microphone drives these — not your phone’s.',
  shadow: 'Slower fantasies, transitions and breathing washes.',
}

/**
 * 199 modes across four families. Only one family renders at a time — mounting
 * all of them at once is what would make this screen crawl on a tablet.
 */
export default function EffectsScreen() {
  const [family, setFamily] = useState('rgb')
  // Where the selection pad sits. Clamped, so an unknown family cannot push it
  // off the control.
  const familyIndex = Math.max(0, FAMILIES.findIndex((f) => f.key === family))
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const activeMode = useLightStore((s) => s.activeMode)
  const speed = useLightStore((s) => s.speed)
  const connected = useConnectionStore(isConnected)
  const showToast = useUiStore((s) => s.showToast)

  const modes = useMemo(() => {
    const all = modesFor(family)
    const q = deferredQuery.trim().toLowerCase()
    return q ? all.filter((m) => m.name.toLowerCase().includes(q)) : all
  }, [family, deferredQuery])

  const play = ({ index, name }) => {
    haptics.tap()
    if (family === 'rgb') controller.setRgbMode(index, name)
    else controller.setSymphony(family, index, name)
    showToast(name, 'ok')
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Effects</h1>
      <p className="screen-sub">
        These animations run across all 19 pieces — the controller cannot limit one to a
        single zone.
      </p>

      {/* The pill's position is the selected index, handed to CSS as a column
          and a row so the same span works two-up on a phone and four-across
          on a wider screen. */}
      <div
        className="seg"
        role="tablist"
        aria-label="Animation family"
        style={{
          '--seg-i': familyIndex,
          '--seg-x': familyIndex % 2,
          '--seg-y': Math.floor(familyIndex / 2),
        }}
      >
        <span className="seg-pill" aria-hidden="true" />
        {FAMILIES.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={family === f.key}
            className={`seg-btn pressable${family === f.key ? ' is-active' : ''}`}
            onClick={() => setFamily(f.key)}
          >
            <span className="seg-title">{f.title}</span>
            <span className="seg-count tnum">{f.count}</span>
          </button>
        ))}
      </div>

      <p className="screen-note">{BLURB[family]}</p>

      <div className="effects-speed card">
        <Brightness
          label="Speed"
          min={1}
          max={6}
          value={speed}
          disabled={!connected}
          onChange={(v) => useLightStore.getState().setSpeed(v)}
          onCommit={(v) => controller.setSpeed(v)}
        />
      </div>
      {/* Outside the card, the way iOS captions a grouped section */}
      <p className="section-footer effects-speed-note">
        1 is the slowest the controller can crawl. 6 is the fastest it can go.
      </p>

      <div className="search">
        <Icon name="effects" size={18} className="search-icon" />
        <input
          type="search"
          className="search-input"
          placeholder={`Search ${modesFor(family).length} patterns`}
          aria-label="Search patterns"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query ? (
          <button type="button" className="search-clear pressable" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>

      {activeMode ? (
        <div className="effects-active card">
          <span>
            Running <b>{activeMode.name}</b>
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => {
              haptics.tap()
              controller.returnToStatic()
              showToast('Back to static colour', 'ok')
            }}
          >
            Back to colour
          </button>
        </div>
      ) : null}

      {modes.length === 0 ? (
        <p className="screen-note">No pattern matches “{query}”.</p>
      ) : (
        // Keyed on the family so switching tabs crossfades the whole grid
        // rather than swapping 63 cards in place.
        <div key={family} className="grid-effects anim-fade">
          {modes.map((m, i) => (
            <div
              key={`${family}-${m.index}`}
              className="anim-rise"
              // Only the first handful stagger — past that it stops reading as
              // choreography and starts reading as lag.
              style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}
            >
              <EffectCard
                index={m.index}
                name={m.name}
                active={activeMode?.family === family && activeMode?.index === m.index}
                disabled={!connected}
                onPress={play}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
