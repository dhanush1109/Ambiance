import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../state/settingsStore'
import logo from '../assets/logo-launch.jpg'
import './LaunchOverlay.css'

/**
 * The first 1.2 seconds of the app.
 *
 * The native splash shows the same logo on the same black, so there is no cut
 * between it and this — the logo simply continues, blooms, takes a sweep of
 * light across it, then dissolves to reveal Home. Underneath, CarHero's outline
 * is already drawing itself: the reveal starts at 780ms, while that draw is
 * around two thirds done, so the logo's line-work hands off to the car's
 * line-work rather than cutting to a finished picture.
 *
 * It is decoration and nothing else — `aria-hidden` with `pointer-events: none`,
 * so a screen reader never sees it and a fast user can tap straight through it
 * to a live interface on the first frame.
 */
export default function LaunchOverlay() {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)

  // Decided once, at mount. Reading this as live state would let a mid-flight
  // settings change unmount the overlay halfway through its fade and leave a
  // hard edge on screen.
  const [skip] = useState(() => reduceMotion || prefersReducedMotion())
  const [done, setDone] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (skip || done) return undefined

    const node = ref.current
    const finish = () => setDone(true)

    // animationend bubbles, and the logo, bloom and sweep all finish before the
    // overlay does. Only the sheet's own fade means the launch is over.
    const onEnd = (e) => { if (e.target === node) finish() }
    node?.addEventListener('animationend', onEnd)

    // The animationend above is the real signal; this is the guarantee. A
    // dropped event, a backgrounded tab mid-launch, or a test environment with
    // no animation support must never leave a black sheet over the app.
    const safety = setTimeout(finish, 2200)

    return () => {
      node?.removeEventListener('animationend', onEnd)
      clearTimeout(safety)
    }
  }, [skip, done])

  if (skip || done) return null

  return (
    <div className="launch" ref={ref} aria-hidden="true">
      <div className="launch-stage">
        <img className="launch-logo" src={logo} alt="" draggable="false" />
        {/* The same artwork again, blurred and screened on top. Cross-fading
            two layers is a compositor job; animating a filter is not. */}
        <img className="launch-bloom" src={logo} alt="" draggable="false" />
        <span className="launch-sweep" />
      </div>
    </div>
  )
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
