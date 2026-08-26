import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useUiStore } from '../state/uiStore'
import './Toast.css'

const ICON = { ok: 'check', error: 'alert', info: 'info' }

/** How long the toast takes to leave. Matches --dur in the stylesheet. */
const EXIT_MS = 240

export default function Toast() {
  const toast = useUiStore((s) => s.toast)

  // The store owns when a toast ends; this owns how it looks while it goes.
  // Holding the last one for the length of the exit is what stops it blinking
  // out of existence the moment its timer runs down.
  const [shown, setShown] = useState(toast)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }

    if (toast) {
      setShown(toast)
      setLeaving(false)
      return undefined
    }

    if (!shown) return undefined

    setLeaving(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setLeaving(false)
      setShown(null)
    }, EXIT_MS)

    return undefined
    // `shown` is deliberately absent: including it would restart the exit
    // every time this effect's own setShown lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div className="toast-layer" role="status" aria-live="polite">
      {shown ? (
        <div
          key={shown.id}
          className={`toast tone-${shown.tone}${leaving ? ' is-leaving' : ''}`}
        >
          <Icon name={ICON[shown.tone] ?? 'info'} size={18} />
          <span>{shown.text}</span>
        </div>
      ) : null}
    </div>
  )
}
