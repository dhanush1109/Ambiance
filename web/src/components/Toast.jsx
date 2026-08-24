import Icon from './Icon'
import { useUiStore } from '../state/uiStore'
import './Toast.css'

const ICON = { ok: 'check', error: 'alert', info: 'info' }

export default function Toast() {
  const toast = useUiStore((s) => s.toast)

  return (
    <div className="toast-layer" role="status" aria-live="polite">
      {toast ? (
        <div key={toast.id} className={`toast tone-${toast.tone}`}>
          <Icon name={ICON[toast.tone] ?? 'info'} size={18} />
          <span>{toast.text}</span>
        </div>
      ) : null}
    </div>
  )
}
