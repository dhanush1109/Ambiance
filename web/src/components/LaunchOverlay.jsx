import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../state/settingsStore'
import { useLaunchStore } from '../state/launchStore'
import logo from '../assets/logo-launch.png'
import intro from '../assets/intro.mp4'
import './LaunchOverlay.css'

/** The owner's intro, played at the speed they asked for. 10.0s becomes 5.0s. */
const RATE = 2

/** Kept fully black before the first play() attempt, per the owner's ask —
 *  the WebView's own media UI (a start-playback glyph, a poster frame) can
 *  only ever be seen on an element that is actually visible, so the video
 *  starts at opacity 0 and this is how long it stays there before trying. */
const HOLD_MS = 500
/** Video must be visibly progressing by now, or we give up and use the bloom. */
const START_TIMEOUT = 2500
/** Playback frozen this long mid-run means a dead decoder, not buffering. */
const STALL_TIMEOUT = 3000
/** How often the watchdog samples currentTime. */
const TICK = 500
/** Absolute ceiling on the whole overlay: START_TIMEOUT to start (that window
 *  already contains HOLD_MS — the hold is inside it, not stacked on top) +
 *  5.0s of playback + the exit. */
const HARD_CAP = 9000
/** The bloom fallback's own length, matching the pre-video launch. */
const BLOOM_MS = 780
/** The crossfade into the app. */
const EXIT_MS = 420

/**
 * The app's opening.
 *
 * Plays `Intro.mp4` - the neon Hycross drawing itself in, holding, then a
 * headlight flare - at 2x, on a flat black plate with nothing behind it
 * visible, then hands off into the car's own outline tracer. The video is
 * letterboxed (`object-fit: contain`) so the 4:3 frame stays whole on a
 * portrait phone. It opens at opacity:0 and only reveals once a real frame
 * has decoded (see LaunchOverlay.css) - a WebView's own start-playback glyph
 * cannot be styled away with page CSS, so hiding the element is what hides it.
 *
 * If the video cannot play for any reason, the overlay falls back to the CSS
 * logo bloom this component used before the video existed. Two paths, one
 * component, so there is no launch in which the app shows nothing.
 *
 * Purely decoration, both paths: aria-hidden and pointer-events:none, so a
 * screen reader never meets it and Home stays live and tappable underneath from
 * the first frame. There is no skip control by choice - at 2x the intro is
 * 5.0s, and a tap already reaches the app rather than being swallowed.
 */
export default function LaunchOverlay() {
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)

  // Decided once, at mount. Reading this live would let a mid-flight settings
  // change unmount the overlay halfway through its fade, leaving a hard edge.
  const [skip] = useState(() => reduceMotion || prefersReducedMotion())
  const [mode, setMode] = useState('video')
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  // True only once a frame has actually decoded. The element is opacity:0
  // until this flips, so nothing the WebView draws on it — a play glyph, a
  // blank first frame — is ever visible.
  const [live, setLive] = useState(false)

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
    useLaunchStore.getState().release()
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
  useLayoutEffect(() => {
    if (skip) return undefined
    useLaunchStore.getState().hold()
    return () => useLaunchStore.getState().release()
  }, [skip])

  useEffect(() => {
    if (skip || gone) return
    after(HARD_CAP, () => {
      useLaunchStore.getState().release()
      setGone(true)
    })
  }, [skip, gone, after])

  // The bloom path has no events of its own to wait on - it is pure CSS - so
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

    // Set by the cleanup below. Every async result is checked against it,
    // because this effect is torn down and re-run on every StrictMode mount in
    // development - and a result from the dead run must not steer the live one.
    let cancelled = false

    const toFallback = () => { if (!cancelled) setMode('fallback') }

    /**
     * A rejected play() usually means autoplay was refused, which is worth
     * falling back for. AbortError does NOT: it is what the browser reports
     * when a pending play() is interrupted by a pause() or a new load - which
     * is exactly what this effect's own cleanup does. Treating that as a
     * refusal is what made development, where StrictMode always mounts twice,
     * fall back to the bloom every single time.
     */
    const onPlayRejected = (err) => {
      if (cancelled || err?.name === 'AbortError') return
      toFallback()
    }

    // Set on both events: a WebView that has not parsed metadata yet ignores
    // the rate, and some engines reset it to 1 when playback actually begins.
    const applyRate = () => { try { el.playbackRate = RATE } catch { /* ignore */ } }

    // Proof, not promise. `playing`/`loadedmetadata` can fire before a frame
    // is actually composited — that gap is exactly the window a WebView's own
    // media UI (a start-playback glyph, a blank poster) would otherwise show
    // through. currentTime moving past zero is the one signal that means a
    // real frame is on screen, so that is what ends the hold.
    // `revealed`, not the `live` state value: this closure is fixed at effect
    // creation and never sees a later render's state, so checking `live` here
    // would silently always read false.
    let revealed = false
    const onProgress = () => {
      if (cancelled || revealed || el.currentTime <= 0) return
      revealed = true
      setLive(true)
    }

    const onError = toFallback
    el.addEventListener('loadedmetadata', applyRate)
    el.addEventListener('playing', applyRate)
    el.addEventListener('timeupdate', onProgress)
    el.addEventListener('ended', leave)
    el.addEventListener('error', onError)

    const attemptPlay = () => {
      // No autoPlay attribute — this explicit call is the only thing that
      // starts playback, which is what makes HOLD_MS an actual hold rather
      // than a delay racing a decode the WebView already began on its own.
      try {
        const p = el.play?.()
        if (p && typeof p.catch === 'function') p.catch(onPlayRejected)
      } catch {
        toFallback()
      }
      applyRate()
    }

    // The element stays at opacity:0 for HOLD_MS regardless of what the
    // WebView does with it in that window — this is the "half second of
    // black" the intro opens on, and it is also what keeps the video's own
    // draw-in intact rather than starting the reveal mid-gesture.
    const holdTimer = setTimeout(attemptPlay, HOLD_MS)

    // Distinguish "still loading" from "never going to play", and "buffering"
    // from "the decoder is gone", by watching whether time actually advances.
    // Measured from mount, not from the delayed play() — the hold is already
    // budgeted into START_TIMEOUT.
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
      cancelled = true
      clearTimeout(holdTimer)
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
      el.removeEventListener('loadedmetadata', applyRate)
      el.removeEventListener('playing', applyRate)
      el.removeEventListener('timeupdate', onProgress)
      el.removeEventListener('ended', leave)
      el.removeEventListener('error', onError)
      // Hand the hardware decoder back rather than waiting for the element to
      // be collected. Ending early must not leave the rest of the muted
      // video still being decoded behind the app.
      try { el.pause() } catch { /* already gone */ }
    }
  }, [skip, gone, mode, leave])

  if (skip || gone) return null

  // The mode rides on a data attribute rather than a class: a `launch-video`
  // modifier on this wrapper would collide with the .launch-video class on the
  // <video> itself and apply the video's own positioning to the whole sheet.
  const cls = [
    'launch',
    leaving ? 'is-leaving' : '',
    // Both paths. Nothing here is interactive, so nothing here may swallow a
    // tap meant for the app underneath.
    'is-decorative',
  ].filter(Boolean).join(' ')

  if (mode === 'fallback') {
    return (
      <div className={cls} data-mode="fallback" aria-hidden="true">
        <span className="launch-scrim" />
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
    <div className={cls} data-mode="video" aria-hidden="true">
      <span className="launch-scrim" />
      <video
        ref={videoRef}
        className={`launch-video${live ? ' is-live' : ''}`}
        src={intro}
        // No autoPlay: that would start the WebView decoding on its own
        // schedule, ahead of HOLD_MS, and the whole point of the hold is that
        // nothing happens on screen before the deliberate delayed play() below.
        muted
        playsInline
        preload="auto"
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        tabIndex={-1}
        onContextMenu={(e) => e.preventDefault()}
      />
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
