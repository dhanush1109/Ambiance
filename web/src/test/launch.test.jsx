/**
 * The launch sequence. It runs once, before the user has done anything, on the
 * slowest frames the app will ever see — so what matters is that it is purely
 * decorative, that it always leaves, and that it never asks the main thread for
 * anything it cannot afford.
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

beforeEach(() => {
  useSettingsStore.setState({ reduceMotion: false })
  setReducedMotionMedia(false)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('decoration only', () => {
  it('hides itself from assistive technology', () => {
    const { container } = render(<LaunchOverlay />)
    const overlay = container.querySelector('.launch')

    expect(overlay).toBeTruthy()
    expect(overlay.getAttribute('aria-hidden')).toBe('true')
  })

  it('lets taps through to the live app underneath', () => {
    const block = css().slice(css().indexOf('.launch {'), css().indexOf('.launch-stage'))
    expect(block).toMatch(/pointer-events:\s*none/)
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
})

describe('it always leaves', () => {
  it('unmounts when its own fade finishes', () => {
    const { container } = render(<LaunchOverlay />)
    const overlay = container.querySelector('.launch')

    act(() => { fireEvent.animationEnd(overlay) })

    expect(container.querySelector('.launch')).toBeNull()
  })

  it('ignores the logo and sweep finishing first', () => {
    const { container } = render(<LaunchOverlay />)

    // Both bubble to the overlay; neither means the launch is over
    act(() => { fireEvent.animationEnd(container.querySelector('.launch-logo')) })
    act(() => { fireEvent.animationEnd(container.querySelector('.launch-sweep')) })

    expect(container.querySelector('.launch')).toBeTruthy()
  })

  it('clears itself even when the animation never reports back', () => {
    vi.useFakeTimers()
    const { container } = render(<LaunchOverlay />)
    expect(container.querySelector('.launch')).toBeTruthy()

    // No animationend at all — a backgrounded tab, or a browser that dropped
    // the event. The safety timer is the only thing standing between the user
    // and a permanently black screen.
    act(() => { vi.advanceTimersByTime(2500) })

    expect(container.querySelector('.launch')).toBeNull()
  })

  it('stays gone once it has finished', () => {
    const { container, rerender } = render(<LaunchOverlay />)
    act(() => { fireEvent.animationEnd(container.querySelector('.launch')) })

    rerender(<LaunchOverlay />)

    expect(container.querySelector('.launch')).toBeNull()
  })
})

describe('reduced motion', () => {
  it('renders nothing when the user has asked for less motion in the app', () => {
    useSettingsStore.setState({ reduceMotion: true })
    const { container } = render(<LaunchOverlay />)
    expect(container.querySelector('.launch')).toBeNull()
  })

  it('renders nothing when the system asks for it', () => {
    setReducedMotionMedia(true)
    const { container } = render(<LaunchOverlay />)
    expect(container.querySelector('.launch')).toBeNull()
  })

  it('does not vanish mid-fade if the setting flips while it is running', () => {
    const { container, rerender } = render(<LaunchOverlay />)
    expect(container.querySelector('.launch')).toBeTruthy()

    act(() => { useSettingsStore.setState({ reduceMotion: true }) })
    rerender(<LaunchOverlay />)

    // Ripping it out part-way would cut the fade to a hard edge. It finishes.
    expect(container.querySelector('.launch')).toBeTruthy()
  })

  it('still leaves under a reduced-motion stylesheet', () => {
    const reduced = css().slice(css().indexOf('@media (prefers-reduced-motion'))
    // The exit must survive: everything else may stop, this may not
    expect(reduced).toMatch(/\.launch\s*\{\s*animation:\s*launch-out/)
    expect(reduced).toMatch(/\.launch-sweep\s*\{\s*display:\s*none/)
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
      // Drop the `@keyframes <name>` header, then every `prop:` left in the
      // block is something a frame declares. Offsets (`from`, `45%`) carry no
      // colon, so they fall out on their own.
      const props = [...block.replace(/@keyframes\s+[\w-]+/, '').matchAll(/([a-z-]+)\s*:/g)]
        .map((m) => m[1])

      expect(props.length, `${name} declares nothing`).toBeGreaterThan(0)
      for (const prop of props) {
        expect(['opacity', 'transform'], `${name} animates ${prop}`).toContain(prop)
      }
    }
  })

  it('ships a launch image sized for a phone, not the 5.6MB original', () => {
    const asset = path.resolve(process.cwd(), 'src/assets/logo-launch.jpg')
    const kb = statSync(asset).size / 1024
    expect(kb).toBeLessThan(400)
  })

  it('keeps the blurred copy static, blurring only once', () => {
    const bloom = css().slice(css().indexOf('.launch-bloom {'))
    expect(bloom).toMatch(/filter:\s*blur\(/)
    // the filter is declared, not animated — the glow rides on opacity
    expect(css()).toMatch(/@keyframes launch-glow \{[^}]*opacity/)
  })
})
