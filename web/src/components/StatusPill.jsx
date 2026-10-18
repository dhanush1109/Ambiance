import Icon from './Icon'
import { useConnectionStore } from '../state/connectionStore'
import { useUiStore } from '../state/uiStore'
import { controller } from '../services/controller'
import { PINNED_DEVICE } from '../config/device'
import './StatusPill.css'

/** Status is carried by text as well as colour — never colour alone. */
const LOOK = {
  idle: { text: 'Not connected', tone: 'off', icon: 'bluetooth' },
  scanning: { text: 'Scanning…', tone: 'busy', icon: 'refresh' },
  connecting: { text: 'Connecting…', tone: 'busy', icon: 'link' },
  connected: { text: 'Connected', tone: 'ok', icon: 'check' },
  reconnecting: { text: 'Reconnecting…', tone: 'busy', icon: 'refresh' },
  error: { text: 'Connection failed', tone: 'bad', icon: 'alert' },
}

export default function StatusPill({ micro = false }) {
  const status = useConnectionStore((s) => s.status)
  const device = useConnectionStore((s) => s.device)
  const showToast = useUiStore((s) => s.showToast)

  const look = LOOK[status] ?? LOOK.idle
  const connected = status === 'connected'
  const busy = status === 'connecting' || status === 'scanning' || status === 'reconnecting'
  const label = micro
    ? connected
      ? 'On'
      : busy
        ? '…'
        : 'Off'
    : connected
      ? device?.name || PINNED_DEVICE.name
      : look.text

  const connect = async () => {
    try {
      await controller.connectPinned()
      showToast(`Connected to ${PINNED_DEVICE.name}`, 'ok')
    } catch (err) {
      showToast(err?.message || 'Could not reach the controller', 'error')
    }
  }

  // When it is already connected the pill is just a readout, not a button
  const Tag = connected || busy ? 'div' : 'button'

  return (
    <Tag
      className={`statuspill tone-${look.tone}${micro ? ' is-micro' : ''}`}
      {...(Tag === 'button'
        ? {
            type: 'button',
            onClick: connect,
            'aria-label': connected
              ? `Connected to ${PINNED_DEVICE.name}`
              : `Not connected. Connect to ${PINNED_DEVICE.name}`,
          }
        : { role: 'status', 'aria-label': connected ? `Connected to ${device?.name || PINNED_DEVICE.name}` : look.text })}
    >
      {/* Keyed on tone so the dot pops when the link state actually changes */}
      <span key={look.tone} className="statuspill-dot" aria-hidden="true" />
      <span key={label} className="statuspill-text tick-swap">
        {label}
      </span>
      {Tag === 'button' && !micro ? (
        <>
          <span className="statuspill-cta">Connect</span>
          <Icon name="chevron-right" size={16} />
        </>
      ) : null}
    </Tag>
  )
}
