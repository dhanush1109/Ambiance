import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../state/settingsStore'
import logo from '../assets/logo-launch.jpg'
import intro from '../assets/intro.mp4'
import './LaunchOverlay.css'

/** The owner's intro, played at the speed they asked for. 10.0s becomes 8.0s. */
const RATE = 1.25

/** Video must be visibly progressing by now, or we give up and use the bloom. */
const START_TIMEOUT = 2500
/** Playback frozen this long mid-run means a dead decoder, not buffering. */
const STALL_TIMEOUT = 3000
/** How often the watchdog samples currentTime. */
const TICK = 500
/** Absolute ceiling on the whole overlay: 2.5s to start + 8.0s + the exit. */
const HARD_CAP = 12000
/** The bloom fallback's own length, matching the pre-video launch. */
const BLOOM_MS = 780
/** The crossfade into the app. */
const EXIT_MS = 420

/**
 * The app's opening.
 *
 * Plays `Intro.mp4` — the neon Hycross drawing itself in, holding, then a
 * headlight flare — at 1.25x, then dissolves into Home. The video is letterboxed
 * rather than cropped (`object-fit: contain`): it is 16:9 on a portrait phone,
 * and because its background is pure black on a pure black overlay the bars are
 * invisible while the car stays whole.
 *
 * If the video cannot play for any reason, the overlay falls back to the CSS
 * logo bloom this component used before the video existed. Two paths, one
 * component, so there is no launch in which the app shows nothing.
 *
 * Because the video runs 8 seconds — far too long to hold someone who just
 * wants to change a colour — the video path is tappable anywhere to skip and
 * shows a Skip control after a moment. The 1.2s bloom path is short enough to
 * stay purely decorative and lets taps straight through to the live app.
 */
export default function LaunchOverlay() {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)

  // Decided once, at mount. Reading this live would let a mid-flight settings
  // change unmount the overlay halfway through its fade, leaving a hard edge.
  const [skip] = useState(() => reduceMotion || prefersReducedMotion())
  const [mode, setMode] = useState('video')
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)

  const videoRef = useRef(null)
  const timers = useRef([])
  const leavingRef = useRef(false)

  const after = useCallback((ms, fn) => {
    const id = setTimeout(fn, ms)
    timers.current.push(id)
    return id
  }, [])

  /**
   * Start the crossfade, then unmount. Idempotent, and guarded by a ref rather
   * than by the state it sets: several things race to end the intro (the video
   * ending, a tap, a stall) and a second caller must not queue a second timer.
   */
  const leave = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    after(EXIT_MS, () => setGone(true))
  }, [after])

  // Nothing below should outlive the component
  useEffect(() => () => {
    for (const id of timers.current) clearTimeout(id)
    timers.current = []
  }, [])

  // The one guarantee that matters: this overlay always goes away. Every other
  // path below is an optimisation on top of this timer.
  useEffect(() => {
    if (skip || gone) return
    after(HARD_CAP, () => setGone(true))
  }, [skip, gone, after])

  // The bloom path has no events of its own to wait on — it is pure CSS — so
  // its length is a timer.
  useEffect(() => {
    if (skip || gone || mode !== 'fallback') return
    after(BLOOM_MS, leave)
  }, [skip, gone, mode, after, leave])

  // Video: drive the rate, watch for it dying, and hand off when it ends.
  useEffect(() => {
    if (skip || gone || mode !== 'video') return undefined
    const el = videoRef.current
    if (!el) return undefined

    const toFallback = () => setMode('fallback')

    // Set on both events: a WebView that has not parsed metadata yet ignores
    // the rate, and some engines reset it to 1 when playback actually begins.
    const applyRate = () => { try { el.playbackRate = RATE } catch { /* ignore */ } }

    const onError = toFallback
    el.addEventListener('loadedmetadata', applyRate)
    el.addEventListener('playing', applyRate)
    el.addEventListener('ended', leave)
    el.addEventListener('error', onError)

    // autoPlay covers this; calling play() explicitly is what surfaces a
    // rejection we can actually react to.
    try {
      const p = el.play?.()
      if (p && typeof p.catch === 'function') p.catch(toFallback)
    } catch {
      toFallback()
    }
    applyRate()

    // Distinguish "still loading" from "never going to play", and "buffering"
    // from "the decoder is gone", by watching whether time actually advances.
    const startedAt = Date.now()
    let lastTime = -1
    let lastMoved = startedAt

    const watchdog = setInterval(() => {
      // A backgrounded app has its video paused by the WebView. That is not a
      // stall, so the clock does not run while we are hidden.
      if (document.hidden) { lastMoved = Date.now(); return }

      const t = el.currentTime
      const now = Date.now()

      if (t !== lastTime) {
        lastTime = t
        lastMoved = now
        return
      }
      if (t === 0) {
        if (now - startedAt > START_TIMEOUT) toFallback()
        return
      }
      if (now - lastMoved > STALL_TIMEOUT) leave()
    }, TICK)

    // Coming back from the background: the WebView leaves the video paused.
    const onVisible = () => {
      if (document.hidden || el.ended) return
      try {
        const p = el.play?.()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch { /* the watchdog will pick it up */ }
      applyRate()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
      el.removeEventListener('loadedmetadata', applyRate)
      el.removeEventListener('playing', applyRate)
      el.removeEventListener('ended', leave)
      el.removeEventListener('error', onError)
    }
  }, [skip, gone, mode, leave])

  if (skip || gone) return null

  // The mode rides on a data attribute rather than a class: a `launch-video`
  // modifier on this wrapper would collide with the .launch-video class on the
  // <video> itself and apply the video's own positioning to the whole sheet.
  const cls = [
    'launch',
    leaving ? 'is-leaving' : '',
    // A 780ms flourish should never intercept a tap; an 8s video has to offer
    // a way past it instead.
    mode === 'fallback' ? 'is-decorative' : '',
  ].filter(Boolean).join(' ')

  if (mode === 'fallback') {
    return (
      <div className={cls} data-mode="fallback" aria-hidden="true">
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

  return (
    <div className={cls} data-mode="video">
      <video
        ref={videoRef}
        className="launch-video"
        src={intro}
        autoPlay
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        aria-hidden="true"
        tabIndex={-1}
        onContextMenu={(e) => e.preventDefault()}
      />
      {/* Full-bleed, so a tap anywhere skips, but still a real button: it has a
          name, it takes focus, and a screen reader offers it as the way out. */}
      <button type="button" className="launch-skip" onClick={leave}>
        <span className="launch-skip-pill">Skip</span>
        <span className="sr-only">Skip intro</span>
      </button>
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
