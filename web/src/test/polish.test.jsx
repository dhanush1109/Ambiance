/**
 * The premium-pass details: the adverse haptic pattern, detented drags,
 * feedback coverage on Favourites, and the source-level guards for things
 * jsdom cannot lay out (concentric radii, z-order, paint containment).
 */
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { act } from 'react'

import Brightness from '../components/Brightness'
import EffectCard from '../components/EffectCard'
import PowerButton from '../components/PowerButton'
import EffectsScreen from '../screens/EffectsScreen'
import FavoritesScreen from '../screens/FavoritesScreen'
import SettingsScreen from '../screens/SettingsScreen'
import { haptics, createDetent } from '../services/haptics'
import { controller } from '../services/controller'
import { mockTransport, sentLog } from '../services/mockTransport'
import { _setTransport } from '../services/transport'
import { _resetQueue } from '../services/commandQueue'
import { useConnectionStore } from '../state/connectionStore'
import { useFavoritesStore } from '../state/favoritesStore'
import { useSettingsStore } from '../state/settingsStore'
import { useUiStore } from '../state/uiStore'

const src = (p) => readFileSync(path.resolve(process.cwd(), `src/${p}`), 'utf8')

beforeEach(async () => {
  _setTransport(mockTransport)
  _resetQueue()
  sentLog.length = 0
  await mockTransport.disconnect()
  useConnectionStore.getState().reset()
  useUiStore.setState({ tab: 'home', toast: null, sheets: [] })
  useSettingsStore.setState({ haptics: true, autoReconnect: false, welcomeAnimation: false })
  useFavoritesStore.setState({ items: [] })
  navigator.vibrate = vi.fn()
  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
})

afterEach(() => {
  cleanup()
  delete navigator.vibrate
})

describe('adverse haptic pattern', () => {
  it('feels unmistakably different from success', () => {
    haptics.success()
    const success = navigator.vibrate.mock.calls.at(-1)[0]
    haptics.error()
    const error = navigator.vibrate.mock.calls.at(-1)[0]

    expect(error).toEqual([30, 60, 30])
    expect(error).not.toEqual(success)
  })

  it('fires when the link drops', async () => {
    await act(async () => { await controller.connectPinned() })
    controller.init()
    navigator.vibrate.mockClear()

    await act(async () => { mockTransport.simulateDrop() })

    await waitFor(() => expect(navigator.vibrate).toHaveBeenCalledWith([30, 60, 30]))
  })

  it('stays silent when the user has turned haptics off', () => {
    useSettingsStore.setState({ haptics: false })
    haptics.error()
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })
})

describe('detented drags', () => {
  it('rate-limits so a sweep ticks instead of buzzing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(1_000_000))
    const fn = vi.fn()
    const detent = createDetent(fn, 80)

    detent()
    detent() // same instant — swallowed
    expect(fn).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(1_000_000 + 100))
    detent()
    expect(fn).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('ticks while dragging the brightness track', () => {
    const onChange = vi.fn()
    const { container } = render(<Brightness value={0} onChange={onChange} />)
    const track = container.querySelector('.brightness-track')
    track.setPointerCapture = () => {}
    track.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 300, height: 48, right: 300, bottom: 48, x: 0, y: 0, toJSON: () => {},
    })

    const ev = new MouseEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 20 })
    Object.defineProperty(ev, 'pointerId', { value: 1 })
    fireEvent(track, ev)

    expect(onChange).toHaveBeenCalled()
    expect(navigator.vibrate).toHaveBeenCalledWith(8)
  })

  it('stays silent when the value changes on its own', () => {
    // Applying a mood or restoring state must not buzz the phone
    const { rerender } = render(<Brightness value={3} onChange={() => {}} />)
    navigator.vibrate.mockClear()
    rerender(<Brightness value={8} onChange={() => {}} />)
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })
})

describe('feedback coverage', () => {
  it('taps when a look is saved', async () => {
    await act(async () => { render(<FavoritesScreen />) })
    navigator.vibrate.mockClear()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save current/i }))
    })

    expect(navigator.vibrate).toHaveBeenCalledWith(15)
    expect(useFavoritesStore.getState().items).toHaveLength(1)
  })

  it('ticks when a setting is switched', async () => {
    await act(async () => { render(<SettingsScreen />) })
    navigator.vibrate.mockClear()

    await act(async () => {
      fireEvent.click(screen.getAllByRole('switch')[0])
    })

    expect(navigator.vibrate).toHaveBeenCalledWith(8)
  })
})

describe('power button state swap', () => {
  it('remounts its glyph and label so each state change animates', () => {
    const { container, rerender } = render(<PowerButton on={false} onToggle={() => {}} />)
    const glyphOff = container.querySelector('.power-glyph')
    expect(glyphOff).toBeTruthy()
    expect(container.querySelector('.power-text').textContent).toBe('Off')

    rerender(<PowerButton on onToggle={() => {}} />)
    expect(container.querySelector('.power-text').textContent).toBe('On')
    // a fresh node, not a mutated one — that is what replays the animation
    expect(container.querySelector('.power-glyph')).not.toBe(glyphOff)
  })
})

describe('source guards', () => {
  it('keeps the dock children concentric with the dock', () => {
    for (const f of ['components/ColorButton.css', 'components/PowerButton.css']) {
      expect(src(f), f).toMatch(/calc\(var\(--r-xl\) - var\(--s4\)\)/)
      expect(src(f), f).toMatch(/calc\(var\(--r-xl\) - var\(--s4\) - 6px\)/)
    }
  })

  it('floats toasts above sheets, so a dropped link is never dimmed out', () => {
    const zOf = (css, cls) => {
      const block = css.split(cls)[1] ?? ''
      return Number(/z-index:\s*(\d+)/.exec(block)?.[1] ?? 0)
    }
    const toastZ = zOf(src('components/Toast.css'), '.toast-layer {')
    const sheetZ = zOf(src('components/Sheet.css'), '.sheet-layer {')
    expect(toastZ).toBeGreaterThan(sheetZ)
  })

  it('stops offscreen effect cards painting their animated strips', () => {
    expect(src('components/cards.css')).toMatch(/content-visibility:\s*auto/)
  })

  it('hides the grab handle where the sheet cannot be dragged', () => {
    const css = src('components/Sheet.css')
    const tablet = css.slice(css.indexOf('@media (min-width: 900px)'))
    expect(tablet).toMatch(/\.sheet-grab\s*\{\s*display:\s*none/)
  })

  it('keeps the speed caption outside its card, the way iOS groups sections', async () => {
    const { container } = render(<EffectsScreen />)
    const card = container.querySelector('.effects-speed')
    const note = screen.getByText(/1 is the slowest/i)

    expect(card).toBeTruthy()
    expect(note).toBeTruthy()
    // Inside the card it reads as a second, unrelated thing in the group
    expect(card.contains(note)).toBe(false)
    expect(note.className).toMatch(/section-footer/)
  })

  it('rides the effect index and check on the artwork, not the label row', () => {
    const { container } = render(
      <EffectCard index={7} name="Cyan Yellow Purple Extension" active onPress={() => {}} />,
    )
    const art = container.querySelector('.effectcard-art')
    const index = container.querySelector('.effectcard-index')
    const check = container.querySelector('.effectcard-check')
    const body = container.querySelector('.effectcard-body')

    expect(art.contains(index)).toBe(true)
    expect(art.contains(check)).toBe(true)
    expect(body.contains(index)).toBe(false)
    expect(index.textContent).toBe('7')
  })

  it('gives long pattern names two lines instead of cutting them off', () => {
    const css = src('components/cards.css')
    const block = css.slice(css.indexOf('.effectcard-name'))
    expect(block).toMatch(/-webkit-line-clamp:\s*2/)
  })

  it('draws the speed and brightness bars as slim capsules', () => {
    const css = src('components/Brightness.css')
    const seg = css.slice(css.indexOf('.brightness-seg {'))
    expect(seg).toMatch(/border-radius:\s*var\(--r-pill\)/)
    // the 48px hit area survives the slimmer bars
    expect(css).toMatch(/height:\s*48px/)
  })

  it('insets settings dividers to where the text starts', () => {
    const css = src('screens/settings.css')
    const divider = css.slice(css.indexOf('.row-divided'))
    expect(divider).toMatch(/left:\s*var\(--s4\)/)
  })

  it('gives screens a proper large title', () => {
    const css = src('theme/glass.css')
    const title = css.slice(css.indexOf('.screen-title {'), css.indexOf('.screen-sub'))
    expect(title).toMatch(/font-weight:\s*700/)
    expect(title).toMatch(/letter-spacing:\s*-0\.02em/)
  })

  it('calls the hardware by its approved name', async () => {
    await act(async () => { render(<SettingsScreen />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    })
    expect(screen.getByText(/but your controller/i)).toBeTruthy()
    expect(screen.queryByText(/your own box/i)).toBeNull()
  })
})
