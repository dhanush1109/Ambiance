import { useState } from 'react'
import Icon from '../components/Icon'
import Card from '../components/Card'
import { useSettingsStore, SETTING_META } from '../state/settingsStore'
import { useConnectionStore, isConnected } from '../state/connectionStore'
import { useUiStore } from '../state/uiStore'
import { controller } from '../services/controller'
import { haptics } from '../services/haptics'
import { transportKind } from '../services/transport'
import { PINNED_DEVICE, ENFORCE_PIN } from '../config/device'
import './settings.css'

const TRANSPORT_LABEL = {
  native: 'Direct Bluetooth (Android)',
  web: 'Web Bluetooth',
  bridge: 'Desktop bridge (server.py)',
  mock: 'Mock — no hardware',
  unavailable: 'No Bluetooth in this browser',
}

export default function SettingsScreen() {
  const settings = useSettingsStore()
  const status = useConnectionStore((s) => s.status)
  const device = useConnectionStore((s) => s.device)
  const devices = useConnectionStore((s) => s.devices)
  const error = useConnectionStore((s) => s.error)
  const connected = useConnectionStore(isConnected)
  const showToast = useUiStore((s) => s.showToast)

  const [advanced, setAdvanced] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [hasScanned, setHasScanned] = useState(false)
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    setBusy(true)
    try {
      await controller.connectPinned()
      showToast(`Connected to ${PINNED_DEVICE.name}`, 'ok')
    } catch (err) {
      showToast(err?.message || 'Could not reach the controller', 'error')
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    setBusy(true)
    haptics.tap()
    try {
      await controller.disconnect()
      showToast('Disconnected', 'info')
    } finally {
      setBusy(false)
    }
  }

  const scan = async () => {
    setScanning(true)
    try {
      const list = await controller.scan()
      setHasScanned(true)
      showToast(`Found ${list.length} device${list.length === 1 ? '' : 's'}`, 'info')
    } catch (err) {
      showToast(err?.message || 'Scan failed', 'error')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Settings</h1>
      <p className="screen-sub">Your controller, and how Ambiance behaves.</p>

      {/* ---------------- pinned device ---------------- */}
      <Card raise className="pinned">
        <div className="pinned-head">
          <Icon name="car" size={22} className="pinned-icon" />
          <div>
            <h2 className="pinned-name">{PINNED_DEVICE.name}</h2>
            <p className="pinned-mac tnum">{PINNED_DEVICE.mac}</p>
          </div>
          <span className={`pinned-status${connected ? ' is-on' : ''}`}>
            {connected ? 'Connected' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'}
          </span>
        </div>

        <p className="pinned-note">
          Ambiance talks to this one controller and nothing else. It connects straight to the
          address above, so there is no scan and no device list to pick from.
        </p>

        <div className="pinned-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={connect}
            disabled={busy || connected}
          >
            {busy ? 'Working…' : 'Connect by MAC'}
          </button>
          <button type="button" className="btn" onClick={disconnect} disabled={busy || !connected}>
            Disconnect
          </button>
        </div>
      </Card>

      {/* ---------------- preferences ---------------- */}
      <section className="section">
        <h2 className="section-head">Behaviour</h2>
        <Card>
          {SETTING_META.map((m, i) => (
            <div key={m.key} className={`row${i ? ' row-divided' : ''}`}>
              <label className="row-label" htmlFor={`set-${m.key}`}>
                <span className="row-title">{m.label}</span>
                <span className="row-hint">{m.hint}</span>
              </label>
              <button
                id={`set-${m.key}`}
                type="button"
                role="switch"
                aria-checked={!!settings[m.key]}
                className={`switch${settings[m.key] ? ' is-on' : ''}`}
                onClick={() => {
                  settings.toggle(m.key)
                  // After the toggle, so switching haptics off is silent and
                  // switching it on confirms itself.
                  haptics.tick()
                }}
              >
                <span className="switch-knob" />
              </button>
            </div>
          ))}
        </Card>
      </section>

      {/* ---------------- advanced ---------------- */}
      <section className="section">
        <button
          type="button"
          className="disclosure"
          aria-expanded={advanced}
          onClick={() => setAdvanced((v) => !v)}
        >
          <Icon name="chevron-down" size={18} className={advanced ? '' : 'rot-90'} />
          Advanced &amp; troubleshooting
        </button>

        {advanced ? (
          <div className="advanced">
            <p className="row-hint">
              Scanning is only a diagnostic here — useful for checking range or confirming the
              controller is powered.
              {ENFORCE_PIN ? ' Ambiance will refuse to connect to anything but your controller.' : ''}
            </p>

            <button type="button" className="btn advanced-scan" onClick={scan} disabled={scanning}>
              <Icon name="refresh" size={18} />
              {scanning ? 'Scanning…' : 'Scan for nearby devices'}
            </button>

            {devices.length > 0 ? (
              <ul className="devlist">
                {devices.map((d) => (
                  <li key={d.address} className={`devrow${d.isPinned ? ' is-pinned' : ''}`}>
                    <span className="devrow-main">
                      <span className="devrow-name">
                        {d.name}
                        {d.isPinned ? <span className="devrow-tag">yours</span> : null}
                      </span>
                      <span className="devrow-addr tnum">{d.address}</span>
                    </span>
                    <span className="devrow-rssi tnum">{d.rssi ?? '—'} dBm</span>
                  </li>
                ))}
              </ul>
            ) : hasScanned && !scanning ? (
              /* A scan that finds nothing should say why, not go quiet */
              <p className="devlist-empty">
                Nothing found. The controller only advertises when it has power and isn’t
                already held by another app or phone.
              </p>
            ) : null}

            <dl className="diag">
              <div>
                <dt>Connection</dt>
                <dd>{TRANSPORT_LABEL[transportKind()] ?? transportKind()}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{status}</dd>
              </div>
              <div>
                <dt>Link</dt>
                <dd>{device ? `${device.name} · type ${device.hw}` : 'none'}</dd>
              </div>
              {error ? (
                <div>
                  <dt>Last error</dt>
                  <dd className="diag-error">{error}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : null}
      </section>

      {/* ---------------- about ---------------- */}
      <section className="section">
        <h2 className="section-head">About</h2>
        <Card className="about">
          <p>
            <b>Ambiance</b> controls the 19-piece ambient LED kit in your Innova Hycross.
          </p>
          <p>
            The controller groups those pieces into three zones and cannot address them
            individually: <b>Front cabin</b> covers the dash strips, vent rings and all four door
            lines and pockets (12 pieces); <b>Handles &amp; feet</b> covers the four inner door
            handles and the footwells (7 pieces); <b>All cabin</b> drives everything at once.
            Animations always run across the whole kit, and brightness has ten steps.
          </p>
          <p>
            On iPhone, add this site to the Home Screen (Share → Add to Home Screen). Safari
            cannot talk Bluetooth, so the lights still need the Android app — or Bluefy.
          </p>
          <p className="about-warn">
            <Icon name="alert" size={16} />
            If you build a release APK, back up the signing keystore. Without it you cannot
            update an installed copy of the app.
          </p>
        </Card>
      </section>
    </div>
  )
}
