import { useState } from 'react'
import CarHero from '../components/CarHero'
import ControlDock from '../components/ControlDock'
import ZoneChips from '../components/ZoneChips'
import Icon from '../components/Icon'
import Brightness from '../components/Brightness'
import { useLightStore } from '../state/lightStore'
import { useConnectionStore, isConnected } from '../state/connectionStore'
import { useUiStore } from '../state/uiStore'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { controller } from '../services/controller'
import { haptics } from '../services/haptics'
import { ambient } from '../engine/ambientEngine'
import { PINNED_DEVICE } from '../config/device'
import { MOODS } from '../data/moods'
import { ZONES } from '../protocol/catalog'
import './HomeScreen.css'

const QUICK = MOODS.slice(0, 6)

/** The landing page: your car, its four doors, and every primary control. */
export default function HomeScreen() {
  const zones = useLightStore((s) => s.zones)
  const selectedZone = useLightStore((s) => s.selectedZone)
  const power = useLightStore((s) => s.power)
  const activeMode = useLightStore((s) => s.activeMode)
  const speed = useLightStore((s) => s.speed)
  const activeMoodId = useLightStore((s) => s.activeMoodId)
  const driftOn = useLightStore((s) => s.driftOn)
  const selectZone = useLightStore((s) => s.selectZone)

  const connected = useConnectionStore(isConnected)
  const status = useConnectionStore((s) => s.status)
  const showToast = useUiStore((s) => s.showToast)
  const tablet = useBreakpoint() === 'tablet'

  const [connecting, setConnecting] = useState(false)

  const zone = zones[selectedZone] ?? zones[3]
  const zoneName = ZONES.find((z) => z.id === selectedZone)?.name ?? 'All cabin'

  const connect = async () => {
    setConnecting(true)
    try {
      await controller.connectPinned()
      showToast(`Connected to ${PINNED_DEVICE.name}`, 'ok')
    } catch (err) {
      showToast(err?.message || 'Could not reach the controller', 'error')
    } finally {
      setConnecting(false)
    }
  }

  const hero = (
    <CarHero
      zones={zones}
      selectedZone={selectedZone}
      power={power}
      activeMode={activeMode}
      onSelectZone={selectZone}
    />
  )

  const readout = (
    <div className="home-readout">
      <div className="home-readout-line">
        <span className="home-swatch" style={{ background: zone.hex }} aria-hidden="true" />
        <span>
          <b>{zoneName}</b> · {zone.hex.toUpperCase()} · brightness{' '}
          <span className="tnum">{zone.brightness}</span>/9
        </span>
      </div>
      <p className="home-truth">
        Front cabin and Handles &amp; feet are the two groups this controller can drive
        separately. A mood follows the zone you have selected — All cabin applies both
        colours.
      </p>
    </div>
  )

  const controls = (
    <>
      <ZoneChips value={selectedZone} onChange={selectZone} disabled={!connected} />

      <div className="home-quick">
        <div className="home-quick-head">
          <h2 className="home-quick-title caps-label">Quick moods</h2>
          <button
            type="button"
            className={`chip home-drift${driftOn ? ' is-active' : ''}`}
            aria-pressed={driftOn}
            disabled={!connected}
            onClick={() => {
              haptics.tap()
              if (driftOn) {
                ambient.stop('user')
                showToast('Drift stopped', 'info')
              } else {
                ambient.start('drift')
                showToast('Drifting', 'ok')
              }
            }}
          >
            <Icon name="refresh" size={18} />
            Drift
          </button>
        </div>

        <div className="home-quick-row">
          {QUICK.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`home-quickchip${activeMoodId === m.id ? ' is-active' : ''}`}
              disabled={!connected}
              onClick={() => {
                haptics.tap()
                controller.applyMood(m)
                showToast(m.name, 'ok')
              }}
              aria-pressed={activeMoodId === m.id}
              aria-label={`Apply ${m.name}`}
            >
              <span
                className="home-quickswatch"
                aria-hidden="true"
                style={{ '--c1': m.z1.hex, '--c2': m.z2.hex }}
              />
              <span className="home-quickname">{m.name}</span>
            </button>
          ))}
        </div>

        <p className="home-drift-note">
          Drift slowly wanders the cabin hue. Touching any colour control hands it back to you.
        </p>
      </div>
    </>
  )

  return (
    <div className={`home${tablet ? ' home-tablet' : ''}`}>
      <header className="home-head">
        <div>
          <h1 className="home-wordmark">Ambiance</h1>
          <p className="home-tagline">Innova Hycross cabin</p>
        </div>
      </header>

      {!connected ? (
        <section className="home-connect card-raise">
          <Icon name="bluetooth" size={26} className="home-connect-icon" />
          <div className="home-connect-body">
            <h2 className="home-connect-title">
              {status === 'reconnecting' ? 'Reconnecting…' : 'Your controller is not connected'}
            </h2>
            <p className="home-connect-sub">
              Ambiance connects straight to {PINNED_DEVICE.name} at {PINNED_DEVICE.mac} — no
              scanning, no device list.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary home-connect-btn"
            onClick={connect}
            disabled={connecting || status === 'connecting'}
          >
            {connecting || status === 'connecting' ? 'Connecting…' : 'Connect by MAC'}
          </button>
        </section>
      ) : null}

      {activeMode ? (
        <section className="home-banner">
          <div className="home-banner-row">
            <Icon name="play" size={18} />
            <span className="home-banner-text">
              <b>{activeMode.name}</b> is running across all 19 pieces
            </span>
            <button
              type="button"
              className="btn home-banner-btn"
              onClick={() => {
                haptics.tap()
                controller.returnToStatic()
                showToast('Back to static colour', 'ok')
              }}
            >
              Back to colour
            </button>
          </div>
          <Brightness
            label="Speed"
            min={1}
            max={6}
            value={speed}
            disabled={!connected}
            onChange={(v) => useLightStore.getState().setSpeed(v)}
            onCommit={(v) => controller.setSpeed(v)}
          />
        </section>
      ) : null}

      {tablet ? (
        <div className="home-panes">
          <div className="home-pane-car">
            {hero}
            {readout}
          </div>
          <div className="home-pane-controls">
            <ControlDock variant="panel" />
            {controls}
          </div>
        </div>
      ) : (
        <>
          {hero}
          {readout}
          {controls}
          <ControlDock variant="floating" />
        </>
      )}
    </div>
  )
}
