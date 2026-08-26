/**
 * The motion pass: sliding selection pads, exit animations for the two things
 * that used to vanish mid-frame, and the guarantee that nothing on a phone
 * scrolls sideways to reach a control.
 */
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { act } from 'react'

import Sheet from '../components/Sheet'
import Toast from '../components/Toast'
import ZoneChips from '../components/ZoneChips'
import EffectsScreen from '../screens/EffectsScreen'
import { useUiStore } from '../state/uiStore'

const src = (p) => readFileSync(path.resolve(process.cwd(), `src/${p}`), 'utf8')

/** The block of a stylesheet belonging to one selector, up to the next rule. */
const rule = (css, selector) => {
  const at = css.indexOf(selector)
  if (at === -1) return ''
  return css.slice(at, css.indexOf('}', at) + 1)
}

beforeEach(() => {
  useUiStore.setState({ tab: 'home', toast: null, sheets: [] })
  document.body.dataset.reduceMotion = '0'
  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('nothing scrolls sideways to reach a control', () => {
  it('wraps the six quick moods instead of hiding two off the edge', () => {
    const css = src('screens/HomeScreen.css')
    const row = rule(css, '.home-quick-row {')

    expect(row).toMatch(/flex-wrap:\s*wrap/)
    expect(row).not.toMatch(/overflow-x:\s*auto/)
    // A scroller with a hidden scrollbar is the worst case: content is gone
    // AND there is nothing to say so.
    expect(css).not.toMatch(/scroll-snap-type/)
  })

  it('shows all four effect families at once', () => {
    const css = src('screens/screens.css')
    const seg = rule(css, '.seg {')

    expect(seg).toMatch(/display:\s*grid/)
    expect(seg).not.toMatch(/overflow-x:\s*auto/)
    // nowrap on a flex:1 button is what pinned the old min-width open
    expect(rule(css, '.seg-btn {')).not.toMatch(/white-space:\s*nowrap/)
  })

  it('leaves no hidden-scrollbar rules behind anywhere', () => {
    for (const f of ['screens/HomeScreen.css', 'screens/screens.css']) {
      expect(src(f), f).not.toMatch(/scrollbar-width:\s*none/)
      expect(src(f), f).not.toMatch(/::-webkit-scrollbar/)
    }
  })
})

describe('the selection slides instead of jumping', () => {
  // ZONES is ordered [3 All cabin, 1 Front cabin, 2 Handles & feet] — the id is
  // the firmware's, the index is the position on screen.
  it('gives the zone chips one pad, positioned by the selected index', () => {
    const { container, rerender } = render(<ZoneChips value={3} onChange={() => {}} />)
    const pad = container.querySelector('.zonechip-pill')
    const group = container.querySelector('.zonechips')

    expect(pad).toBeTruthy()
    expect(group.style.getPropertyValue('--zone-i')).toBe('0')

    rerender(<ZoneChips value={2} onChange={() => {}} />)
    expect(group.style.getPropertyValue('--zone-i')).toBe('2')
  })

  it('keeps an unknown zone from pushing the pad off the row', () => {
    const { container } = render(<ZoneChips value={99} onChange={() => {}} />)
    expect(container.querySelector('.zonechips').style.getPropertyValue('--zone-i')).toBe('0')
  })

  it('positions the effects pad as a column and a row', () => {
    const { container } = render(<EffectsScreen />)
    const seg = container.querySelector('.seg')

    expect(container.querySelector('.seg-pill')).toBeTruthy()
    // 'rgb' is first: column 0, row 0
    expect(seg.style.getPropertyValue('--seg-x')).toBe('0')
    expect(seg.style.getPropertyValue('--seg-y')).toBe('0')

    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: /magic shadow/i }))
    })
    // fourth family: second column, second row
    expect(seg.style.getPropertyValue('--seg-x')).toBe('1')
    expect(seg.style.getPropertyValue('--seg-y')).toBe('1')
    expect(seg.style.getPropertyValue('--seg-i')).toBe('3')
  })

  it('moves both pads on the compositor, never on layout', () => {
    for (const [file, sel] of [
      ['components/ZoneChips.css', '.zonechip-pill {'],
      ['screens/screens.css', '.seg-pill {'],
    ]) {
      const block = rule(src(file), sel)
      expect(block, sel).toMatch(/transition:\s*transform/)
      expect(block, sel).toMatch(/transform:\s*translate/)
      // animating left/width would relayout every frame
      expect(block, sel).not.toMatch(/transition:[^;]*\b(left|width|top)\b/)
    }
  })

  it('does not paint a second accent block over the zone pad', () => {
    const block = rule(src('components/ZoneChips.css'), '.zonechip.is-active,')
    expect(block).toMatch(/background:\s*transparent/)
  })
})

describe('things leave the way they arrived', () => {
  it('holds the sheet on screen for its exit rather than cutting it', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(
      <Sheet open title="Colour" onClose={() => {}}>body</Sheet>,
    )
    expect(container.querySelector('.sheet')).toBeTruthy()

    rerender(<Sheet open={false} title="Colour" onClose={() => {}}>body</Sheet>)

    // still there, playing its exit
    const layer = container.querySelector('.sheet-layer')
    expect(layer).toBeTruthy()
    expect(layer.className).toMatch(/is-leaving/)

    act(() => { vi.advanceTimersByTime(300) })
    expect(container.querySelector('.sheet-layer')).toBeNull()
  })

  it('stops being a dialog the moment it is dismissed', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(
      <Sheet open title="Colour" onClose={() => {}}>body</Sheet>,
    )
    expect(screen.queryByRole('dialog', { name: 'Colour' })).toBeTruthy()

    rerender(<Sheet open={false} title="Colour" onClose={() => {}}>body</Sheet>)

    // Visually still leaving, but a screen reader must not be told there is a
    // modal dialog open, and nothing in it may be tapped.
    expect(container.querySelector('.sheet')).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: 'Colour' })).toBeNull()
    expect(container.querySelector('.sheet-layer').getAttribute('aria-hidden')).toBe('true')
    expect(rule(src('components/Sheet.css'), '.sheet-layer.is-leaving {'))
      .toMatch(/pointer-events:\s*none/)
  })

  it('reopening mid-exit cancels the exit instead of queuing a second one', () => {
    vi.useFakeTimers()
    const { container, rerender } = render(
      <Sheet open title="Colour" onClose={() => {}}>body</Sheet>,
    )
    rerender(<Sheet open={false} title="Colour" onClose={() => {}}>body</Sheet>)
    rerender(<Sheet open title="Colour" onClose={() => {}}>body</Sheet>)

    act(() => { vi.advanceTimersByTime(400) })

    // The pending unmount must not fire and take the reopened sheet with it
    expect(container.querySelector('.sheet')).toBeTruthy()
    expect(container.querySelector('.sheet-layer').className).not.toMatch(/is-leaving/)
  })

  it('skips the sheet exit entirely under reduced motion', () => {
    vi.useFakeTimers()
    document.body.dataset.reduceMotion = '1'
    const { container, rerender } = render(
      <Sheet open title="Colour" onClose={() => {}}>body</Sheet>,
    )
    rerender(<Sheet open={false} title="Colour" onClose={() => {}}>body</Sheet>)

    expect(container.querySelector('.sheet-layer')).toBeNull()
  })

  it('lifts the toast away instead of blinking it out', () => {
    vi.useFakeTimers()
    const { container } = render(<Toast />)

    act(() => { useUiStore.setState({ toast: { id: 1, text: 'Saved', tone: 'ok' } }) })
    expect(container.querySelector('.toast')).toBeTruthy()

    act(() => { useUiStore.setState({ toast: null }) })
    expect(container.querySelector('.toast').className).toMatch(/is-leaving/)

    act(() => { vi.advanceTimersByTime(300) })
    expect(container.querySelector('.toast')).toBeNull()
  })

  it('a new toast during the old one leaving replaces it cleanly', () => {
    vi.useFakeTimers()
    const { container } = render(<Toast />)

    act(() => { useUiStore.setState({ toast: { id: 1, text: 'First', tone: 'ok' } }) })
    act(() => { useUiStore.setState({ toast: null }) })
    act(() => { useUiStore.setState({ toast: { id: 2, text: 'Second', tone: 'ok' } }) })
    act(() => { vi.advanceTimersByTime(300) })

    const toast = container.querySelector('.toast')
    expect(toast, 'the pending exit must not remove the new toast').toBeTruthy()
    expect(toast.textContent).toContain('Second')
    expect(toast.className).not.toMatch(/is-leaving/)
  })
})

describe('press feedback reaches everything you can press', () => {
  it('marks the controls that had none', () => {
    const { container } = render(<ZoneChips value="all" onChange={() => {}} />)
    expect(container.querySelector('.zonechip').className).toMatch(/pressable/)
  })

  it('gives the effect family tabs a press state', () => {
    const { container } = render(<EffectsScreen />)
    expect(container.querySelector('.seg-btn').className).toMatch(/pressable/)
  })

  it('transitions the colour swatch rather than snapping it', () => {
    // The rest of the app tweens --light; the swatch that triggers the change
    // was the one thing that jumped.
    expect(rule(src('components/ColorButton.css'), '.colorbtn-swatch {'))
      .toMatch(/transition:\s*background-color/)
  })

  it('transitions every colour the status pill changes', () => {
    const block = rule(src('components/StatusPill.css'), '.statuspill {')
    for (const prop of ['background-color', 'border-color', 'color']) {
      expect(block, prop).toMatch(new RegExp(prop))
    }
  })

  it('turns the settings chevron instead of flipping it', () => {
    expect(rule(src('screens/settings.css'), '.disclosure .icon {'))
      .toMatch(/transition:\s*transform/)
  })
})

describe('housekeeping', () => {
  it('carries no keyframes nothing uses', () => {
    const all = ['theme/glass.css', 'components/Sheet.css', 'components/Toast.css',
      'components/ZoneChips.css', 'screens/screens.css', 'components/cards.css',
      'screens/HomeScreen.css', 'screens/settings.css', 'App.css',
      'components/LaunchOverlay.css']
      .map((f) => src(f)).join('\n')
    const jsx = ['components/Sheet.jsx', 'components/Toast.jsx', 'components/ZoneChips.jsx']
      .map((f) => src(f)).join('\n')

    for (const m of all.matchAll(/@keyframes\s+([\w-]+)/g)) {
      const name = m[1]
      // used by an animation shorthand somewhere, or referenced from JS
      const uses = (all.match(new RegExp(`animation[^;]*\\b${name}\\b`, 'g')) ?? []).length
      expect(uses + (jsx.includes(name) ? 1 : 0), `@keyframes ${name} is never used`)
        .toBeGreaterThan(0)
    }
  })
})
