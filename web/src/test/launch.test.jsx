/**
 * The launch sequence: the owner's intro video at 2x on a flat black plate,
 * with the CSS logo bloom behind it as a fallback.
 *
 * It runs once, before the user has done anything, on the slowest frames the
 * app will ever see, and it is the one screen that can wedge the whole app if it
 * refuses to leave. So the weight here is on the failure paths — a dead decoder,
 * a refused autoplay, a frozen stream, a backgrounded app — none of which can be
 * produced by hand on a device.
 */
// @vitest-environment jsdom
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { StrictMode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'

import LaunchOverlay from '../components/LaunchOverlay'
import { useSettingsStore } from '../state/settingsStore'
import { useLaunchStore } from '../state/launchStore'

const src = (p) => readFileSync(path.resolve(process.cwd(), `src/${p}`), 'utf8')
const css = () => src('components/LaunchOverlay.css')

// Mirrors the constants in LaunchOverlay.jsx
const RATE = 2
const HOLD_MS = 500
const START_TIMEOUT = 2500
const STALL_TIMEOUT = 3000
const HARD_CAP = 9000
const BLOOM_MS = 780
const EXIT_MS = 420
/** Intro.mp4 is 10.006s; at RATE that is what the user actually sits through. */
const RUNTIME_MS = (10.006 / RATE) * 1000

/** Swap in a matchMedia whose answer for reduced-motion we control. */
function setReducedMotionMedia(matches) {
  window.matchMedia = (q) => ({
    matches: matches && /prefers-reduced-motion/.test(q),
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })
}

/**
 * jsdom has no media stack at all: play() is "not implemented" and currentTime
 * is read-only. Give the prototype just enough to be driven from a test.
 */
function stubMediaElement({ play = () => Promise.resolve() } = {}) {
  HTMLMediaElement.prototype.play = play
  HTMLMediaElement.prototype.pause = () => {}
  let time = 0
  let rate = 1
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (v) => { time = v },
  })
  Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
    configurable: true,
    get: () => rate,
    set: (v) => { rate = v },
  })
  return {
    seek: (v) => { time = v },
    rate: () => rate,
  }
}

function setHidden(hidden) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
}

const q = (c, sel) => c.querySelector(sel)

beforeEach(() => {
  useSettingsStore.setState({ reduceMotion: false })
  useLaunchStore.setState({ gate: 'open' })
  setReducedMotionMedia(false)
  setHidden(false)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the intro video', () => {
  it('plays the owner’s intro, muted and inline', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    expect(video).toBeTruthy()
    expect(video.getAttribute('src')).toMatch(/intro/)
    expect(video.muted).toBe(true)
    // No autoPlay attribute: playback starts from the explicit, delayed
    // play() call in the effect, not from the browser's own schedule — that
    // delay is what makes the opening hold deterministic.
    expect(video.autoplay).toBe(false)
    // Without playsinline, Android hands the video to a fullscreen player
    expect(video.hasAttribute('playsinline')).toBe(true)
  })

  it('runs at 2x — the speed that was asked for', () => {
    const media = stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    act(() => { fireEvent(video, new Event('loadedmetadata')) })
    expect(media.rate()).toBeCloseTo(RATE)
  })

  it('re-asserts the rate when playback actually begins', () => {
    const media = stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    act(() => { fireEvent(video, new Event('loadedmetadata')) })
    // Some engines snap back to 1x the moment they start decoding
    media.seek(0)
    HTMLMediaElement.prototype.playbackRate = 1
    act(() => { fireEvent(video, new Event('playing')) })

    expect(media.rate()).toBeCloseTo(RATE)
  })

  it('stays silent, so launching in a paired car makes no noise', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch-video').muted).toBe(true)
  })

  it('hands off to the app when it ends', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    act(() => { fireEvent(video, new Event('ended')) })
    expect(q(container, '.launch').className).toMatch(/is-leaving/)

    act(() => { vi.advanceTimersByTime(EXIT_MS + 20) })
    expect(q(container, '.launch')).toBeNull()
  })
})

describe('it stays out of the way', () => {
  it('offers no controls at all — the intro just plays', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    expect(q(container, '.launch-skip')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('never swallows a tap meant for the app underneath', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    // Nothing here is interactive, so it must not intercept anything
    expect(q(container, '.launch').className).toMatch(/is-decorative/)
    const block = css().slice(css().indexOf('.launch.is-decorative'))
    expect(block).toMatch(/pointer-events:\s*none/)
  })

  it('releases the decoder when it goes', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const pause = vi.fn()
    HTMLMediaElement.prototype.pause = pause
    const { container } = render(<LaunchOverlay />)

    act(() => { fireEvent(q(container, '.launch-video'), new Event('ended')) })
    act(() => { vi.advanceTimersByTime(EXIT_MS + 20) })

    expect(pause).toHaveBeenCalled()
  })

  it('only queues one exit however many things end the intro at once', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    act(() => {
      fireEvent(video, new Event('ended'))
      fireEvent(video, new Event('ended'))
    })
    act(() => { vi.advanceTimersByTime(EXIT_MS + 20) })

    expect(q(container, '.launch')).toBeNull()
  })
})

describe('when the video will not play', () => {
  it('falls back to the logo bloom on a decoder error', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    act(() => { fireEvent(q(container, '.launch-video'), new Event('error')) })

    expect(q(container, '.launch-video')).toBeNull()
    expect(q(container, '.launch-stage')).toBeTruthy()
  })

  it('falls back when autoplay is refused', async () => {
    vi.useFakeTimers()
    stubMediaElement({ play: () => Promise.reject(new Error('NotAllowedError')) })
    const { container } = render(<LaunchOverlay />)

    // play() is not attempted until the hold elapses; let it, then let the
    // rejected promise settle.
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLD_MS) })

    expect(q(container, '.launch-stage')).toBeTruthy()
  })

  it('falls back when play() throws outright', () => {
    vi.useFakeTimers()
    stubMediaElement({ play: () => { throw new Error('no media stack') } })
    const { container } = render(<LaunchOverlay />)

    act(() => { vi.advanceTimersByTime(HOLD_MS) })

    expect(q(container, '.launch-stage')).toBeTruthy()
  })

  it('does NOT fall back when our own teardown interrupts play()', async () => {
    // AbortError is what a browser reports when a pending play() is cut off by
    // a pause() — which is exactly what this component's cleanup does. Reading
    // that as "autoplay refused" is what made every dev launch show the bloom.
    vi.useFakeTimers()
    const abort = Object.assign(new Error('interrupted by pause()'), { name: 'AbortError' })
    stubMediaElement({ play: () => Promise.reject(abort) })

    const { container } = render(<LaunchOverlay />)
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLD_MS) })

    expect(q(container, '.launch-video'), 'AbortError must not trigger the fallback').toBeTruthy()
    expect(q(container, '.launch-stage')).toBeNull()
  })

  it('survives StrictMode mounting it twice, as it does in development', async () => {
    // React mounts, tears down and remounts every component in dev, entirely
    // synchronously — well under HOLD_MS. The throwaway first mount's hold
    // timer is cleared by its own cleanup before it can ever fire, so it never
    // reaches play() at all; only the surviving second mount's hold timer
    // lives long enough to call it. The hold is what fixes this, incidentally:
    // there is no longer a phantom play() to reject in the first place.
    vi.useFakeTimers()
    let call = 0
    stubMediaElement({
      play: () => { call += 1; return Promise.resolve() },
    })

    const { container } = render(
      <StrictMode><LaunchOverlay /></StrictMode>,
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLD_MS) })

    expect(call, 'only the surviving mount should ever call play()').toBe(1)
    expect(q(container, '.launch-video'), 'dev must play the video, not the bloom').toBeTruthy()
    expect(q(container, '.launch-stage')).toBeNull()
  })

  it('ignores a refusal that arrives after it has been torn down', async () => {
    vi.useFakeTimers()
    let reject
    stubMediaElement({ play: () => new Promise((_, r) => { reject = r }) })
    const { container, unmount } = render(<LaunchOverlay />)

    // play() must actually have been called — and `reject` assigned — before
    // there is anything to reject after teardown.
    await act(async () => { await vi.advanceTimersByTimeAsync(HOLD_MS) })
    expect(reject, 'play() should have been called by now').toBeTypeOf('function')

    unmount()
    // The rejection lands after cleanup — it must not touch state
    await act(async () => {
      reject(new Error('NotAllowedError'))
      await Promise.resolve()
    })

    expect(q(container, '.launch')).toBeNull()
  })

  it('falls back when the video loads but never starts moving', () => {
    vi.useFakeTimers()
    stubMediaElement({ play: () => Promise.resolve() })
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch-video')).toBeTruthy()

    // currentTime never leaves 0 — buffering forever, or a silently dead stream
    act(() => { vi.advanceTimersByTime(START_TIMEOUT + 600) })

    expect(q(container, '.launch-stage')).toBeTruthy()
  })

  it('gives the video time to start before giving up on it', () => {
    vi.useFakeTimers()
    const media = stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    act(() => { vi.advanceTimersByTime(1000) })
    media.seek(0.3)
    act(() => { vi.advanceTimersByTime(1000) })

    // It started late but it did start — no fallback
    expect(q(container, '.launch-video')).toBeTruthy()
  })

  it('the fallback still ends, and on the original 1.2s rhythm', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    act(() => { fireEvent(q(container, '.launch-video'), new Event('error')) })

    act(() => { vi.advanceTimersByTime(BLOOM_MS + 20) })
    expect(q(container, '.launch').className).toMatch(/is-leaving/)

    act(() => { vi.advanceTimersByTime(EXIT_MS + 20) })
    expect(q(container, '.launch')).toBeNull()
  })

  it('lets taps through once it is only the short bloom', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    act(() => { fireEvent(q(container, '.launch-video'), new Event('error')) })

    expect(q(container, '.launch').className).toMatch(/is-decorative/)
    const block = css().slice(css().indexOf('.launch.is-decorative'))
    expect(block).toMatch(/pointer-events:\s*none/)
  })
})

describe('when the video dies mid-play', () => {
  it('hands off rather than hanging on a frozen stream', () => {
    vi.useFakeTimers()
    const media = stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    media.seek(2)
    act(() => { vi.advanceTimersByTime(600) })
    // time stops advancing from here — decoder gone, not buffering
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT + 600) })

    expect(q(container, '.launch').className).toMatch(/is-leaving/)
  })

  it('does not mistake a backgrounded app for a stall', () => {
    vi.useFakeTimers()
    const media = stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    media.seek(2)
    act(() => { vi.advanceTimersByTime(600) })

    // The WebView pauses video when the app goes to the background. Ending the
    // intro here would mean returning to a half-played launch.
    setHidden(true)
    act(() => { vi.advanceTimersByTime(STALL_TIMEOUT * 2) })

    expect(q(container, '.launch').className).not.toMatch(/is-leaving/)
  })

  it('resumes playing when the app comes back to the foreground', () => {
    const play = vi.fn(() => Promise.resolve())
    stubMediaElement({ play })
    render(<LaunchOverlay />)
    const initial = play.mock.calls.length

    setHidden(false)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    expect(play.mock.calls.length).toBeGreaterThan(initial)
  })
})

describe('it always leaves', () => {
  it('clears itself even if every other signal fails', () => {
    vi.useFakeTimers()
    // A video that reports nothing at all: no error, no ended, no progress,
    // and a play() that never settles either way.
    stubMediaElement({ play: () => new Promise(() => {}) })
    const { container } = render(<LaunchOverlay />)

    act(() => { vi.advanceTimersByTime(HARD_CAP + 100) })

    // The ceiling is the one guarantee: the app is never left behind a sheet.
    expect(q(container, '.launch')).toBeNull()
  })

  it('caps above the real runtime, so it never truncates the intro', () => {
    // 10.006s at 2x is 5.003s, plus up to START_TIMEOUT to get going, plus the
    // exit. A cap under that would cut the video off mid-flare.
    expect(HARD_CAP).toBeGreaterThan(RUNTIME_MS + START_TIMEOUT + EXIT_MS)
  })

  it('stays gone once it has finished', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container, rerender } = render(<LaunchOverlay />)

    act(() => { fireEvent(q(container, '.launch-video'), new Event('ended')) })
    act(() => { vi.advanceTimersByTime(EXIT_MS + 20) })
    rerender(<LaunchOverlay />)

    expect(q(container, '.launch')).toBeNull()
  })

  it('drops its timers when unmounted early', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container, unmount } = render(<LaunchOverlay />)
    expect(q(container, '.launch')).toBeTruthy()

    unmount()
    // Nothing should still be scheduled trying to set state on a dead component
    expect(() => act(() => { vi.advanceTimersByTime(HARD_CAP * 2) })).not.toThrow()
  })
})

describe('the gate into the car tracer', () => {
  it('holds the gate while the intro plays', () => {
    stubMediaElement()
    render(<LaunchOverlay />)
    expect(useLaunchStore.getState().gate).toBe('held')
  })

  it('releases the gate as the crossfade starts', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    act(() => { fireEvent(q(container, '.launch-video'), new Event('ended')) })

    expect(useLaunchStore.getState().gate).toBe('open')
    expect(q(container, '.launch').className).toMatch(/is-leaving/)
  })

  it('releases the gate on the hard-cap path', () => {
    vi.useFakeTimers()
    stubMediaElement({ play: () => new Promise(() => {}) })
    render(<LaunchOverlay />)
    expect(useLaunchStore.getState().gate).toBe('held')

    act(() => { vi.advanceTimersByTime(HARD_CAP + 100) })

    expect(useLaunchStore.getState().gate).toBe('open')
  })

  it('releases the gate on unmount', () => {
    stubMediaElement()
    const { unmount } = render(<LaunchOverlay />)
    expect(useLaunchStore.getState().gate).toBe('held')

    unmount()
    expect(useLaunchStore.getState().gate).toBe('open')
  })

  it('never holds when reduced motion skips the overlay', () => {
    useSettingsStore.setState({ reduceMotion: true })
    render(<LaunchOverlay />)
    expect(useLaunchStore.getState().gate).toBe('open')
  })
})

describe('reduced motion', () => {
  it('plays no intro when the user has asked for less motion in the app', () => {
    useSettingsStore.setState({ reduceMotion: true })
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch')).toBeNull()
  })

  it('plays no intro when the system asks for it', () => {
    setReducedMotionMedia(true)
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch')).toBeNull()
  })

  it('does not vanish mid-fade if the setting flips while it is running', () => {
    stubMediaElement()
    const { container, rerender } = render(<LaunchOverlay />)
    expect(q(container, '.launch')).toBeTruthy()

    act(() => { useSettingsStore.setState({ reduceMotion: true }) })
    rerender(<LaunchOverlay />)

    // Ripping it out part-way would cut the fade to a hard edge. It finishes.
    expect(q(container, '.launch')).toBeTruthy()
  })

  it('still leaves under a reduced-motion stylesheet', () => {
    const reduced = css().slice(css().indexOf('@media (prefers-reduced-motion'))
    // Everything else may stop; the exit may not
    expect(reduced).toMatch(/\.launch\.is-leaving\s*\{\s*animation:\s*launch-out/)
    expect(reduced).toMatch(/\.launch-sweep\s*\{\s*display:\s*none/)
  })
})

describe('presentation', () => {
  it('hides the whole video path from assistive technology', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch').getAttribute('aria-hidden')).toBe('true')
  })

  it('hides the whole bloom path, which has no controls to reach', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    act(() => { fireEvent(q(container, '.launch-video'), new Event('error')) })
    expect(q(container, '.launch').getAttribute('aria-hidden')).toBe('true')
  })

  it('turns off the video element\'s own controls, not just the CSS', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    // Belt and braces: the CSS hides the WebView's control chrome, and this
    // is the React-level attribute doing the same job independently.
    expect(video.controls).toBe(false)
    expect(video.getAttribute('controlsList') ?? '').toMatch(/nofullscreen/)
  })

  it('covers the toast and sheet layers rather than sliding under them', () => {
    const zOf = (file, cls) => {
      const body = src(file).split(cls)[1] ?? ''
      return Number(/z-index:\s*(\d+)/.exec(body)?.[1] ?? 0)
    }
    const launch = zOf('components/LaunchOverlay.css', '.launch {')
    expect(launch).toBeGreaterThan(zOf('components/Toast.css', '.toast-layer {'))
    expect(launch).toBeGreaterThan(zOf('components/Sheet.css', '.sheet-layer {'))
  })

  it('letterboxes the video instead of cropping the car away', () => {
    const block = css().slice(
      css().indexOf('.launch-video {'),
      css().indexOf('/* ---------------- fallback path'),
    )
    // cover would still crop the flanks off a 960x720 frame on a ~9:19.5 phone
    expect(block).toMatch(/object-fit:\s*contain/)
    expect(block).not.toMatch(/object-fit:\s*cover/)
  })

  it('never blends the video against whatever is behind it', () => {
    // Guarded against the slice markers going missing: if either indexOf
    // returns -1 the slice runs to end-of-file and would start matching the
    // bloom path's OWN mix-blend-mode (on .launch-bloom / .launch-sweep,
    // which never composite against the app and are correct to keep it) —
    // silently passing even if the video still blends. Fail closed instead.
    const start = css().indexOf('.launch-video {')
    const end = css().indexOf('/* ---------------- fallback path')
    expect(start, 'the .launch-video rule moved or was renamed').toBeGreaterThan(-1)
    expect(end, 'the fallback-path banner comment moved or was renamed').toBeGreaterThan(start)

    const block = css().slice(start, end)
    expect(block).not.toMatch(/mix-blend-mode/)
    expect(block).toMatch(/background:\s*var\(--bg/)
  })

  it('sits on an opaque plate, so nothing behind the intro is ever visible', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch-scrim')).toBeTruthy()

    const root = css().slice(css().indexOf('.launch {'), css().indexOf('.launch.is-decorative'))
    expect(root).toMatch(/background:\s*var\(--bg/)
    expect(root).not.toMatch(/background:\s*transparent/)

    // The scrim itself must be a static plate, not a fade the app could show
    // through partway — nothing in .launch-scrim's own rule may animate.
    const scrim = css().slice(css().indexOf('.launch-scrim {'), css().indexOf('/* ---------------- video path'))
    expect(scrim).not.toMatch(/animation/)
  })

  it('opens invisible, so nothing the WebView draws on it can ever be seen', () => {
    // ::-webkit-media-controls* rules are inert in the Chromium WebViews that
    // matter here — a Chromium media element's own start-playback glyph lives
    // outside page CSS's reach. Hiding the element itself is the only thing
    // that reliably hides whatever the WebView puts on it, so the base rule
    // must open at opacity 0 with no other way to become visible.
    const block = css().slice(
      css().indexOf('.launch-video {'),
      css().indexOf('.launch-video.is-live {'),
    )
    expect(block).toMatch(/opacity:\s*0\s*;/)
    expect(block).not.toMatch(/::-webkit-media-controls/)
  })

  it('reveals only through the one class JS grants on real progress', () => {
    const live = css().slice(css().indexOf('.launch-video.is-live {'))
    expect(live).toMatch(/opacity:\s*1/)
  })

  it('fades in rather than snapping, and only opacity moves', () => {
    const block = css().slice(
      css().indexOf('.launch-video {'),
      css().indexOf('.launch-video.is-live {'),
    )
    expect(block).toMatch(/transition:\s*opacity/)
  })

  it('does not reveal itself until a real frame has decoded', async () => {
    vi.useFakeTimers()
    const media = stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    // Half a second of nothing but the hold — no autoplay, so no play() has
    // even been attempted this early, and the element must still be dark.
    act(() => { vi.advanceTimersByTime(HOLD_MS - 50) })
    expect(video.className).not.toMatch(/is-live/)

    // play() attempted, but currentTime is still 0 — a `playing` event alone,
    // with no real progress, must not be enough to reveal it.
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    act(() => { fireEvent(video, new Event('playing')) })
    expect(video.className).not.toMatch(/is-live/)

    // Now a frame has actually decoded.
    media.seek(0.05)
    act(() => { fireEvent(video, new Event('timeupdate')) })
    expect(video.className).toMatch(/is-live/)
  })

  it('never attempts play() before the hold elapses', () => {
    vi.useFakeTimers()
    const play = vi.fn(() => Promise.resolve())
    stubMediaElement({ play })
    render(<LaunchOverlay />)

    expect(play).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(HOLD_MS + 20) })
    expect(play).toHaveBeenCalled()
  })

  it('never sets autoplay, so the hold is the only thing that starts it', () => {
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch-video').autoplay).toBe(false)
  })

  it('renders a scrim on the bloom path too', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    act(() => { fireEvent(q(container, '.launch-video'), new Event('error')) })
    expect(q(container, '.launch-scrim')).toBeTruthy()
  })

  it('carries no leftover styling for the removed skip control', () => {
    expect(css()).not.toMatch(/\.launch-skip/)
  })
})

describe('cost', () => {
  it('animates nothing the compositor cannot handle alone', () => {
    // A blur or a box-shadow inside a keyframe repaints every frame, on the
    // slowest frames the app ever has. Only opacity and transform are free.
    const blocks = css().match(/@keyframes\s+launch-[\w-]+\s*\{[\s\S]*?\n\}/g) ?? []
    expect(blocks.length).toBeGreaterThanOrEqual(5)

    for (const block of blocks) {
      const name = /launch-[\w-]+/.exec(block)[0]
      const props = [...block.replace(/@keyframes\s+[\w-]+/, '').matchAll(/([a-z-]+)\s*:/g)]
        .map((m) => m[1])

      expect(props.length, `${name} declares nothing`).toBeGreaterThan(0)
      for (const prop of props) {
        expect(['opacity', 'transform'], `${name} animates ${prop}`).toContain(prop)
      }
    }
  })

  it('ships the owner’s video stream untouched, not a re-encode', () => {
    // A stream copy of Logo/Intro.mp4: no generation loss at all. The earlier
    // CRF-20 pass was visually lossless but still a re-encode, and the owner
    // asked for quality over size. A re-encode would land near 1.6 MB, so the
    // floor here is what catches one sneaking back in.
    const mb = statSync(path.resolve(process.cwd(), 'src/assets/intro.mp4')).size / 1024 / 1024
    expect(mb).toBeGreaterThan(2.2)
    expect(mb).toBeLessThan(4)
  })

  it('carries no audio track it would never unmute', () => {
    // The one thing the stream copy does drop. The video is muted by design, so
    // the AAC track is pure weight. 'mp4a' is the AAC sample-entry fourcc.
    const bytes = readFileSync(path.resolve(process.cwd(), 'src/assets/intro.mp4'))
    expect(bytes.includes(Buffer.from('mp4a'))).toBe(false)
    expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  })

  it('keeps the fallback art lossless', () => {
    // PNG, not JPEG: this is neon line-work on black, where JPEG ringing shows.
    const png = path.resolve(process.cwd(), 'src/assets/logo-launch.png')
    expect(statSync(png).size).toBeGreaterThan(0)
    // an 8-byte PNG signature, so a renamed JPEG cannot pass
    expect(readFileSync(png).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  })

  it('keeps the blurred copy static, blurring only once', () => {
    const bloom = css().slice(css().indexOf('.launch-bloom {'))
    expect(bloom).toMatch(/filter:\s*blur\(/)
    // the filter is declared, not animated — the glow rides on opacity
    expect(css()).toMatch(/@keyframes launch-glow \{[^}]*opacity/)
  })
})
