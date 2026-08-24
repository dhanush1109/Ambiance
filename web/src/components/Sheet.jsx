import { useCallback, useEffect, useRef } from 'react'
import Icon from './Icon'
import { useUiStore } from '../state/uiStore'
import { useBreakpoint } from '../hooks/useBreakpoint'
import {
  armDrag,
  exitDuration,
  rubberBand,
  sheetDragOutcome,
  velocityFrom,
} from './sheetDrag'
import './Sheet.css'

let sheetSeq = 0

/**
 * Bottom sheet on a phone, centred dialog on the tablet.
 *
 * `anchor` springs the tablet presentation from the control pane on the right
 * instead of the screen centre — for a sheet whose trigger lives there, per
 * Apple's guidance that a sheet presentation "springs from its source
 * element". Phone presentation is unaffected either way.
 *
 * On a phone the sheet can be dragged away by its handle or header. The grab
 * bar was drawn long before it did anything — an affordance promising a
 * gesture that did not exist. The physics live in ./sheetDrag.
 *
 * Focus is trapped, Escape closes, and the hardware back button closes the
 * top-most open sheet (see services/backButton.js). Dragging is an addition to
 * those, never a replacement — nothing here is reachable only by gesture.
 */
export default function Sheet({ open, title, onClose, children, footer, anchor = false }) {
  const panel = useRef(null)
  const scrim = useRef(null)
  const restoreTo = useRef(null)
  const idRef = useRef(null)
  if (idRef.current === null) idRef.current = `sheet-${(sheetSeq += 1)}`

  const phone = useBreakpoint() === 'phone'

  // Kept in a ref so an inline arrow `onClose` doesn't re-register every render
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // Stop the page behind the sheet scrolling. Save and restore rather than
  // blanking, so stacked sheets and any pre-existing value survive.
  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Announce ourselves so the hardware back button can close us
  useEffect(() => {
    if (!open) return undefined
    const id = idRef.current
    const { registerSheet, unregisterSheet } = useUiStore.getState()
    registerSheet(id, () => closeRef.current?.())
    return () => useUiStore.getState().unregisterSheet(id)
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    restoreTo.current = document.activeElement
    const node = panel.current
    const focusables = () =>
      node?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? []

    // Focus the first control, or the panel itself if there are none
    const first = focusables()[0]
    ;(first ?? node)?.focus?.()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const list = [...focusables()]
      if (!list.length) return
      const firstEl = list[0]
      const lastEl = list[list.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      restoreTo.current?.focus?.()
    }
  }, [open, onClose])

  /* ---------------- drag to dismiss (phone only) ---------------- */

  const drag = useRef(null)
  const closeTimer = useRef(null)

  const reduceMotion = () =>
    document.body.dataset.reduceMotion === '1' ||
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  /** Live translateY, so a gesture can catch the sheet mid-flight. */
  const liveOffset = useCallback(() => {
    const node = panel.current
    if (!node) return 0
    try {
      const t = getComputedStyle(node).transform
      if (!t || t === 'none') return 0
      return new DOMMatrix(t).m42 || 0
    } catch {
      return 0
    }
  }, [])

  const paint = useCallback((y, height) => {
    const node = panel.current
    if (!node) return
    node.style.transform = y ? `translateY(${y}px)` : ''
    if (scrim.current && height > 0) {
      const progress = Math.max(0, Math.min(1, y / height))
      scrim.current.style.opacity = String(1 - 0.7 * progress)
    }
  }, [])

  const onPointerDown = useCallback(
    (e) => {
      if (!phone || e.button > 0) return
      const node = panel.current
      if (!node) return

      // Only the handle and header start a drag. The body is left alone so a
      // scrollable sheet still scrolls, and so ColorField's own pointer
      // capture (and the rename input) are never fighting for the gesture.
      const inHandle =
        !!e.target.closest?.('.sheet-grab, .sheet-head') && !e.target.closest?.('button')
      if (!inHandle) return

      // The entrance animation fills forwards, which pins transform and would
      // silently defeat every inline value we set below.
      node.style.animation = 'none'
      if (scrim.current) scrim.current.style.animation = 'none'

      // Catch a sheet that is still settling or leaving.
      if (closeTimer.current) {
        clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
      const startOffset = liveOffset()
      node.classList.remove('is-settling', 'is-dismissing')

      drag.current = {
        id: e.pointerId,
        startY: e.clientY,
        startX: e.clientX,
        startOffset,
        height: node.getBoundingClientRect().height || 0,
        armed: false,
        samples: [{ t: e.timeStamp || Date.now(), y: startOffset }],
      }
    },
    [phone, liveOffset],
  )

  const onPointerMove = useCallback(
    (e) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return

      const dy = e.clientY - d.startY
      const dx = e.clientX - d.startX

      if (!d.armed) {
        if (!armDrag({ inHandle: true, dx, dy })) return
        d.armed = true
        panel.current?.classList.add('is-dragging')
        panel.current?.setPointerCapture?.(e.pointerId)
      }

      const raw = d.startOffset + dy
      // Downward tracks the finger; upward resists.
      const y = raw >= 0 ? raw : -rubberBand(-raw)

      d.samples.push({ t: e.timeStamp || Date.now(), y })
      if (d.samples.length > 6) d.samples.shift()

      paint(y, d.height)
    },
    [paint],
  )

  const endDrag = useCallback(
    (e) => {
      const d = drag.current
      if (!d || (e && e.pointerId !== d.id)) return
      drag.current = null

      const node = panel.current
      if (!node) return
      node.classList.remove('is-dragging')
      node.releasePointerCapture?.(e?.pointerId)

      if (!d.armed) return

      const offset = d.samples[d.samples.length - 1]?.y ?? 0
      const velocity = velocityFrom(d.samples)
      const outcome = sheetDragOutcome({ offset, velocity, sheetHeight: d.height })

      if (outcome === 'settle') {
        if (reduceMotion()) {
          paint(0, d.height)
          if (scrim.current) scrim.current.style.opacity = ''
          return
        }
        node.classList.add('is-settling')
        node.style.transform = ''
        if (scrim.current) scrim.current.style.opacity = ''
        const done = () => node.classList.remove('is-settling')
        node.addEventListener('transitionend', done, { once: true })
        return
      }

      if (reduceMotion()) {
        closeRef.current?.()
        return
      }

      const ms = exitDuration(offset, velocity, d.height)
      node.style.setProperty('--sheet-exit', `${Math.round(ms)}ms`)
      node.classList.add('is-dismissing')
      node.style.transform = `translateY(${d.height + 40}px)`
      if (scrim.current) scrim.current.style.opacity = '0'

      let fired = false
      const finish = () => {
        if (fired) return
        fired = true
        closeTimer.current = null
        closeRef.current?.()
      }
      node.addEventListener(
        'transitionend',
        (ev) => {
          if (ev.propertyName === 'transform') finish()
        },
        { once: true },
      )
      // transitionend can be dropped (and never fires in jsdom) — the sheet
      // must still close.
      closeTimer.current = setTimeout(finish, ms + 80)
    },
    [paint],
  )

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    },
    [],
  )

  if (!open) return null

  return (
    <div className={`sheet-layer${anchor ? ' is-anchored' : ''}`}>
      <div ref={scrim} className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        className="sheet glass-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="sheet-close pressable" onClick={onClose} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  )
}
