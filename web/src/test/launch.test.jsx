/**
 * The launch sequence: the owner's intro video at 1.25x, with the CSS logo
 * bloom behind it as a fallback.
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
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { fireEvent } from '@testing-library/dom'

import LaunchOverlay from '../components/LaunchOverlay'
import { useSettingsStore } from '../state/settingsStore'

const src = (p) => readFileSync(path.resolve(process.cwd(), `src/${p}`), 'utf8')
const css = () => src('components/LaunchOverlay.css')

// Mirrors the constants in LaunchOverlay.jsx
const START_TIMEOUT = 2500
const STALL_TIMEOUT = 3000
const HARD_CAP = 12000
const BLOOM_MS = 780
const EXIT_MS = 420

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
    expect(video.autoplay).toBe(true)
    // Without playsinline, Android hands the video to a fullscreen player
    expect(video.hasAttribute('playsinline')).toBe(true)
  })

  it('runs at 1.25x — the speed that was asked for', () => {
    const media = stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    act(() => { fireEvent(video, new Event('loadedmetadata')) })
    expect(media.rate()).toBeCloseTo(1.25)
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

    expect(media.rate()).toBeCloseTo(1.25)
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

describe('getting past it', () => {
  it('offers a skip control with a name', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const skip = q(container, '.launch-skip')

    expect(skip).toBeTruthy()
    expect(skip.tagName).toBe('BUTTON')
    // Not an unlabelled hit area — it has to announce itself
    expect(skip.textContent).toMatch(/skip/i)
  })

  it('leaves immediately when tapped', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)

    act(() => { fireEvent.click(q(container, '.launch-skip')) })
    act(() => { vi.advanceTimersByTime(EXIT_MS + 20) })

    expect(q(container, '.launch')).toBeNull()
  })

  it('takes taps during the video, unlike the short bloom', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    // An 8s video must be escapable; a 780ms flourish must not eat a tap
    expect(q(container, '.launch').className).not.toMatch(/is-decorative/)
  })

  it('only queues one exit however many things end the intro at once', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    const video = q(container, '.launch-video')

    act(() => {
      fireEvent(video, new Event('ended'))
      fireEvent.click(q(container, '.launch-skip'))
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
    stubMediaElement({ play: () => Promise.reject(new Error('NotAllowedError')) })
    const { container } = render(<LaunchOverlay />)

    // let the rejected play() promise settle
    await act(async () => { await Promise.resolve() })

    expect(q(container, '.launch-stage')).toBeTruthy()
  })

  it('falls back when play() throws outright', () => {
    stubMediaElement({ play: () => { throw new Error('no media stack') } })
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch-stage')).toBeTruthy()
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
    // 10.0s at 1.25x is 8.0s, plus up to START_TIMEOUT to get going, plus the
    // exit. A cap under that would cut the video off.
    expect(HARD_CAP).toBeGreaterThan(8000 + START_TIMEOUT + EXIT_MS)
  })

  it('stays gone once it has finished', () => {
    vi.useFakeTimers()
    stubMediaElement()
    const { container, rerender } = render(<LaunchOverlay />)

    act(() => { fireEvent.click(q(container, '.launch-skip')) })
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
  it('hides the video itself from assistive technology', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    expect(q(container, '.launch-video').getAttribute('aria-hidden')).toBe('true')
  })

  it('hides the whole bloom path, which has no controls to reach', () => {
    stubMediaElement()
    const { container } = render(<LaunchOverlay />)
    act(() => { fireEvent(q(container, '.launch-video'), new Event('error')) })
    expect(q(container, '.launch').getAttribute('aria-hidden')).toBe('true')
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

  it('letterboxes the 16:9 video instead of cropping the car away', () => {
    const block = css().slice(css().indexOf('.launch-video {'), css().indexOf('.launch-skip {'))
    // cover would cut the flanks off a 1280x720 frame on a ~9:19.5 phone
    expect(block).toMatch(/object-fit:\s*contain/)
    expect(block).not.toMatch(/object-fit:\s*cover/)
  })

  it('holds the skip pill back so it is not on the opening frame', () => {
    const block = css().slice(css().indexOf('.launch-skip-pill {'))
    const delay = /animation:[^;]*?(\d+)ms\s+var\(--ease\)\s+(\d+)ms/.exec(block)
    expect(delay).toBeTruthy()
    expect(Number(delay[2])).toBeGreaterThanOrEqual(1000)
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

  it('ships an intro sized for a phone', () => {
    const mb = statSync(path.resolve(process.cwd(), 'src/assets/intro.mp4')).size / 1024 / 1024
    expect(mb).toBeLessThan(2.5)
  })

  it('carries no audio track it would never unmute', () => {
    // Stripped with a stream copy, so the video is untouched but the AAC track
    // and its ~160KB are gone. 'mp4a' is the AAC sample-entry fourcc.
    const bytes = readFileSync(path.resolve(process.cwd(), 'src/assets/intro.mp4'))
    expect(bytes.includes(Buffer.from('mp4a'))).toBe(false)
    expect(bytes.includes(Buffer.from('avc1'))).toBe(true)
  })

  it('keeps the fallback art small too', () => {
    const kb = statSync(path.resolve(process.cwd(), 'src/assets/logo-launch.jpg')).size / 1024
    expect(kb).toBeLessThan(400)
  })

  it('keeps the blurred copy static, blurring only once', () => {
    const bloom = css().slice(css().indexOf('.launch-bloom {'))
    expect(bloom).toMatch(/filter:\s*blur\(/)
    // the filter is declared, not animated — the glow rides on opacity
    expect(css()).toMatch(/@keyframes launch-glow \{[^}]*opacity/)
  })
})
