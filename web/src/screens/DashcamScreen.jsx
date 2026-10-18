import { useEffect, useState } from 'react'
import Card from '../components/Card'
import Icon from '../components/Icon'
import { useUiStore } from '../state/uiStore'
import { useDashcamStore, isLive, statusAge } from '../state/dashcamStore'
import { isDirectBlocked, streamUrls } from '../services/dashcamApi'
import { isPinnedCamera, formatFirmware } from '../services/dashcamProtocol'
import { DASHCAM_NAME, PINNED_CAMERA, POLL_MS } from '../config/dashcam'
import { haptics } from '../services/haptics'
import './screens.css'
import './dashcam.css'

/** MB from the firmware, read as something a person would say. */
function formatSize(mb) {
  if (typeof mb !== 'number' || !Number.isFinite(mb)) return '—'
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB`
  return `${mb} MB`
}

function formatAge(ms) {
  if (!Number.isFinite(ms)) return 'never'
  const s = Math.round(ms / 1000)
  if (s < 15) return 'just now'
  if (s < 90) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

/** Status is carried by words as well as colour — never colour alone. */
function describe({ phase, status, live }) {
  if (phase === 'unpaired') return { text: 'Not paired', tone: 'off' }
  if (phase === 'loading' && !status) return { text: 'Checking…', tone: 'busy' }
  if (!status) return { text: 'No camera found', tone: 'off' }
  if (!live) return { text: 'Last seen', tone: 'off' }
  if (status.recording) return { text: 'Recording', tone: 'rec' }
  if (status.recording === false) return { text: 'Standby', tone: 'ok' }
  return { text: 'Online', tone: 'ok' }
}

/**
 * Pairing gate.
 *
 * Shown instead of the readout until this device has a code. Deliberately
 * explains what the code protects, so it reads as a safeguard rather than an
 * obstacle between the owner and their own camera.
 */
function PairForm({ onPair }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return

    haptics.tap()
    setBusy(true)
    setError(null)
    try {
      await onPair(code)
    } catch (err) {
      setError(err?.message || 'That code was not accepted')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card raise className="dc-pair">
      <p className="dc-note-title">
        <Icon name="info" size={16} />
        Pair this device
      </p>
      <p className="screen-note dc-note-body">
        Your dashcam’s status is private. Enter the pairing code once on this
        device and it will be remembered.
      </p>

      <form className="dc-pair-form" onSubmit={submit}>
        <label className="dc-pair-label" htmlFor="dc-pair-code">
          Pairing code
        </label>
        <input
          id="dc-pair-code"
          className="dc-pair-input"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="current-password"
          // The code is not a word; stop phones from "fixing" it.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
          disabled={busy}
        />
        <button type="submit" className="btn btn-primary pressable" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Pair'}
        </button>
      </form>

      {error ? (
        <p className="screen-note dc-error" role="status">
          {error}
        </p>
      ) : null}
    </Card>
  )
}

export default function DashcamScreen() {
  const tab = useUiStore((s) => s.tab)
  const showToast = useUiStore((s) => s.showToast)

  const phase = useDashcamStore((s) => s.phase)
  const status = useDashcamStore((s) => s.status)
  const error = useDashcamStore((s) => s.error)
  const live = useDashcamStore(isLive)
  const refresh = useDashcamStore((s) => s.refresh)
  const command = useDashcamStore((s) => s.command)
  const pair = useDashcamStore((s) => s.pair)

  const open = tab === 'dashcam'
  const remote = isDirectBlocked()

  // "Updated 2 min ago" has to keep counting on its own, because a camera
  // that has gone quiet produces no state change to re-render on. Held as
  // state rather than read from the clock mid-render, so the component stays
  // a pure function of its inputs.
  const [now, setNow] = useState(() => Date.now())

  // Only poll while the screen is actually showing. Every screen stays mounted
  // for the life of the app, so an unconditional interval would keep hitting
  // the camera from behind a hidden tab for as long as the app is open.
  useEffect(() => {
    if (!open) return undefined

    refresh()
    setNow(Date.now())

    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [open, refresh])

  // Polling is separate, and stops while this device is unpaired: retrying a
  // call that is refused by design would just hammer the relay with 401s.
  useEffect(() => {
    if (!open || phase === 'unpaired') return undefined

    const poll = setInterval(() => refresh({ quiet: true }), POLL_MS)
    return () => clearInterval(poll)
  }, [open, phase, refresh])

  const age = statusAge(status?.at, now)

  const look = describe({ phase, status, live })
  const sd = status?.sd ?? {}
  const busy = phase === 'loading'
  const unpaired = phase === 'unpaired'

  // undefined means "nothing identifying was reported" — not "wrong camera".
  const pinned = isPinnedCamera(status, PINNED_CAMERA)
  const foreign = pinned === false

  const send = async (action) => {
    haptics.tap()
    try {
      await command(action)
      showToast(action === 'start' ? 'Recording started' : 'Recording stopped', 'ok')
    } catch (err) {
      showToast(err?.message || 'Camera did not answer', 'error')
    }
  }

  // Shared so the gate and the readout cannot drift apart.
  const header = (
    <>
      <h1 className="screen-title">{DASHCAM_NAME}</h1>
      <p className="screen-sub">
        {PINNED_CAMERA.name} — your own recorder, read straight from the
        camera. Status is posted by the car-side bridge, so you can check it
        from any device.
      </p>
    </>
  )

  // The gate replaces the readout rather than sitting above it: empty tiles
  // behind a pairing form imply there is something there to see.
  if (unpaired) {
    return (
      <div className="screen">
        {header}
        <PairForm onPair={pair} />
      </div>
    )
  }

  return (
    <div className="screen">
      {header}

      <Card raise className={`dc-hero tone-${look.tone}`}>
        <div className="dc-hero-top">
          <span className="dc-dot" aria-hidden="true" />
          <div className="dc-hero-text">
            <p className="dc-state" role="status">
              {look.text}
            </p>
            <p className="dc-meta">
              {status ? `Updated ${formatAge(age)}` : 'Waiting for the camera'}
              {status?.host ? ` · ${status.host}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="dc-refresh pressable"
            onClick={() => {
              haptics.tap()
              refresh()
            }}
            disabled={busy}
            aria-label="Refresh dashcam status"
          >
            <Icon name="refresh" size={18} className={busy ? 'dc-spin' : ''} />
          </button>
        </div>

        {/* The card is only ever as confident as the reading behind it. */}
        {status && !live ? (
          <p className="dc-warn">
            The camera stopped reporting. This is the last reading, not what it
            is doing now.
          </p>
        ) : null}

        {/* A camera's CGI surface has no authentication, so a different
            recorder on the same subnet answers identically. Saying so is the
            only safeguard against reading a stranger's footage as your own. */}
        {foreign ? (
          <p className="dc-warn dc-warn-alert">
            This reading came from {status?.device?.model || status?.wifi?.ssid},
            not {PINNED_CAMERA.name}. Showing it, but it is not your camera.
          </p>
        ) : null}
      </Card>

      <div className="dc-stats">
        <Card className="dc-stat">
          <span className="dc-stat-head">
            <Icon name="sd" size={16} />
            Storage
          </span>
          <strong className="dc-stat-value">
            {sd.present === false ? 'No card' : sd.usedPct !== undefined ? `${sd.usedPct}%` : '—'}
          </strong>
          <span className="dc-stat-sub">
            {sd.present === false
              ? 'Insert a card to record'
              : sd.freeMb !== undefined
                ? `${formatSize(sd.freeMb)} free of ${formatSize(sd.totalMb)}`
                : 'Card size unknown'}
          </span>
          {sd.usedPct !== undefined ? (
            <span className="dc-bar" aria-hidden="true">
              <span className="dc-bar-fill" style={{ '--pct': `${sd.usedPct}%` }} />
            </span>
          ) : null}
        </Card>

        <Card className="dc-stat">
          <span className="dc-stat-head">
            <Icon name="dashcam" size={16} />
            Mode
          </span>
          <strong className="dc-stat-value">{status?.mode || (status ? 'Normal' : '—')}</strong>
          <span className="dc-stat-sub">
            {status?.parking ? 'Parking monitor on' : status ? 'Parking monitor off' : 'Unknown'}
          </span>
        </Card>

        <Card className="dc-stat">
          <span className="dc-stat-head">
            <Icon name="wifi" size={16} />
            Camera Wi-Fi
          </span>
          {/* The pinned SSID when the camera is quiet: it is the network you
              need to join, and it is just as true offline as online. */}
          <strong className="dc-stat-value dc-stat-value-sm">
            {status?.wifi?.ssid || PINNED_CAMERA.ssid}
          </strong>
          <span className="dc-stat-sub">
            {status?.wifi?.channel
              ? `Channel ${status.wifi.channel}`
              : status?.wifi?.ssid
                ? 'Access point'
                : 'Join this network in the car'}
          </span>
        </Card>

        <Card className="dc-stat">
          <span className="dc-stat-head">
            <Icon name="info" size={16} />
            Device
          </span>
          <strong className="dc-stat-value dc-stat-value-sm">
            {status?.device?.model || PINNED_CAMERA.name}
          </strong>
          <span className="dc-stat-sub">
            {/* Falls back to the firmware recorded when this camera was
                pinned, so the build is still shown while it is offline. */}
            Firmware{' '}
            {formatFirmware(status?.device?.firmware) ??
              formatFirmware(PINNED_CAMERA.firmware)}
          </span>
        </Card>
      </div>

      {/* Recording commands travel to the camera directly, which is only
          possible on its own Wi-Fi. Hidden rather than shown broken. */}
      {remote ? (
        <Card className="dc-note">
          <p className="dc-note-title">
            <Icon name="info" size={16} />
            Viewing remotely
          </p>
          <p className="screen-note dc-note-body">
            Start, stop and live view need the camera’s own Wi-Fi
            (<code>{PINNED_CAMERA.ssid}</code>). Join it from this phone and
            these controls appear.
          </p>
        </Card>
      ) : (
        <Card className="dc-actions">
          <div className="dc-actions-row">
            <button
              type="button"
              className="btn btn-primary pressable"
              onClick={() => send('start')}
              disabled={!live || status?.recording === true}
            >
              <Icon name="play" size={18} filled />
              Start recording
            </button>
            <button
              type="button"
              className="btn pressable"
              onClick={() => send('stop')}
              disabled={!live || status?.recording === false}
            >
              <Icon name="stop" size={18} filled />
              Stop
            </button>
          </div>

          <p className="screen-note dc-note-body">
            Live view is an RTSP stream — open it in a player that speaks RTSP,
            such as VLC.
          </p>
          <ul className="dc-streams">
            {streamUrls(status?.host).map((url) => (
              <li key={url}>
                <code>{url}</code>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error ? (
        <p className="screen-note dc-error" role="status">
          {error}
        </p>
      ) : null}
    </div>
  )
}
