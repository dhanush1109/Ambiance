/**
 * Drag-to-dismiss: the physics, and the component wiring around it.
 *
 * The grab handle was drawn for a long time before it did anything â€” an
 * affordance promising a gesture that did not exist. These tests pin down the
 * behaviour that now backs it, and guard the close paths it must not disturb.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { act } from 'react'

import Sheet from '../components/Sheet'
import {
  armDrag,
  exitDuration,
  projectEndpoint,
  rubberBand,
  sheetDragOutcome,
  velocityFrom,
} from '../components/sheetDrag'
import { useUiStore } from '../state/uiStore'

/**
 * jsdom has no PointerEvent; MouseEvent carries the coordinates we read.
 *
 * `t` matters: jsdom stamps synthetic events microseconds apart, which would
 * make every drag read as an impossibly fast flick. Passing explicit
 * timestamps models the ~16ms spacing a real pointer stream has.
 */
function pointer(el, type, clientX, clientY, t = 0) {
  const ev = new MouseEvent(type, { bubbles: true, clientX, clientY })
  Object.defineProperty(ev, 'pointerId', { value: 1 })
  Object.defineProperty(ev, 'timeStamp', { value: t })
  fireEvent(el, ev)
}

/** Give the panel a real size and swallow the capture calls jsdom lacks. */
function prepPanel(panel, height = 600) {
  panel.setPointerCapture = () => {}
  panel.releasePointerCapture = () => {}
  panel.getBoundingClientRect = () => ({
    top: 0, left: 0, right: 400, bottom: height, width: 400, height,
    x: 0, y: 0, toJSON: () => {},
  })
}

beforeEach(() => {
  useUiStore.setState({ tab: 'home', toast: null, sheets: [] })
  document.body.dataset.reduceMotion = '0'
  document.body.style.overflow = ''
  window.matchMedia = (q) => ({
    // phone: the 900px tablet query does not match
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })
})

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('drag physics', () => {
  it('projects where a flick would carry the sheet, not where it was let go', () => {
    // decel 0.998 â†’ velocity multiplied by 499
    expect(projectEndpoint(100, 1.0)).toBeCloseTo(599, 0)
    expect(projectEndpoint(100, 0)).toBe(100)
  })

  it('dismisses a deep slow drag', () => {
    expect(sheetDragOutcome({ offset: 350, velocity: 0, sheetHeight: 600 })).toBe('dismiss')
  })

  it('sends a deep drag home when it is flicked back up', () => {
    // The whole point of judging the projection: this is travelling upward,
    // so it belongs at rest even though it is most of the way down.
    expect(sheetDragOutcome({ offset: 350, velocity: -1.0, sheetHeight: 600 })).toBe('settle')
  })

  it('dismisses a shallow fast flick', () => {
    expect(sheetDragOutcome({ offset: 60, velocity: 1.2, sheetHeight: 600 })).toBe('dismiss')
  })

  it('settles a shallow slow drag', () => {
    expect(sheetDragOutcome({ offset: 60, velocity: 0.05, sheetHeight: 600 })).toBe('settle')
  })

  it('never dismisses everything just because height is unmeasured', () => {
    // jsdom (and a sheet measured pre-layout) reports zero height
    expect(sheetDragOutcome({ offset: 0, velocity: 0, sheetHeight: 0 })).toBe('settle')
  })

  it('resists rather than stopping dead past the top', () => {
    expect(rubberBand(0)).toBe(0)
    expect(rubberBand(10)).toBeLessThan(10)
    expect(rubberBand(100)).toBeGreaterThan(rubberBand(50))
    expect(rubberBand(10_000)).toBeLessThan(32) // asymptotic to the limit
  })

  it('waits for a deliberate vertical gesture before committing', () => {
    expect(armDrag({ inHandle: true, dx: 0, dy: 8 })).toBe(false) // under hysteresis
    expect(armDrag({ inHandle: true, dx: 0, dy: 12 })).toBe(true)
    expect(armDrag({ inHandle: true, dx: 20, dy: 12 })).toBe(false) // more sideways
    expect(armDrag({ inHandle: false, dx: 0, dy: 40 })).toBe(false) // wrong zone
  })

  it('reads velocity from the end of the gesture, not its average', () => {
    // Long slow crawl, then a flick in the final 60ms
    const samples = [
      { t: 0, y: 0 }, { t: 400, y: 20 }, { t: 940, y: 40 }, { t: 1000, y: 100 },
    ]
    expect(velocityFrom(samples)).toBeCloseTo(1.0, 1)
    expect(velocityFrom([{ t: 0, y: 0 }])).toBe(0)
    expect(velocityFrom([])).toBe(0)
  })

  it('matches the exit duration to the speed it was thrown', () => {
    expect(exitDuration(100, 5, 600)).toBe(160) // fast flick clamps short
    expect(exitDuration(100, 0.1, 600)).toBe(320) // slow drag clamps long
  })
})

describe('sheet drag wiring', () => {
  it('follows the finger when dragged by the handle', async () => {
    const onClose = vi.fn()
    const { container } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    const panel = container.querySelector('.sheet')
    const grab = container.querySelector('.sheet-grab')
    prepPanel(panel)

    await act(async () => {
      pointer(grab, 'pointerdown', 200, 100, 0)
      pointer(panel, 'pointermove', 200, 160, 50)
    })

    expect(panel.style.transform).toMatch(/translateY\(6\d(\.\d+)?px\)/)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('springs back and stays open after a small drag', async () => {
    const onClose = vi.fn()
    const { container } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    const panel = container.querySelector('.sheet')
    const grab = container.querySelector('.sheet-grab')
    prepPanel(panel)

    await act(async () => {
      pointer(grab, 'pointerdown', 200, 100, 0)
      pointer(panel, 'pointermove', 200, 120, 50)
      pointer(panel, 'pointermove', 200, 140, 100)
      pointer(panel, 'pointerup', 200, 140, 100)
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(useUiStore.getState().sheets).toHaveLength(1)
    expect(panel.className).toMatch(/is-settling/)
  })

  it('closes once, after the exit animation, on a deep drag', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const { container } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    const panel = container.querySelector('.sheet')
    const grab = container.querySelector('.sheet-grab')
    prepPanel(panel)

    act(() => {
      pointer(grab, 'pointerdown', 200, 0, 0)
      pointer(panel, 'pointermove', 200, 200, 100)
      pointer(panel, 'pointermove', 200, 400, 200)
      pointer(panel, 'pointerup', 200, 400, 200)
    })

    expect(panel.className).toMatch(/is-dismissing/)
    expect(onClose).not.toHaveBeenCalled() // waits for the animation

    // transitionend never fires in jsdom â€” the safety timer must still close it
    act(() => { vi.advanceTimersByTime(500) })
    expect(onClose).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(2000) })
    expect(onClose).toHaveBeenCalledTimes(1) // and only once
    vi.useRealTimers()
  })

  it('closes immediately when the user has asked for reduced motion', async () => {
    document.body.dataset.reduceMotion = '1'
    const onClose = vi.fn()
    const { container } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    const panel = container.querySelector('.sheet')
    const grab = container.querySelector('.sheet-grab')
    prepPanel(panel)

    await act(async () => {
      pointer(grab, 'pointerdown', 200, 0, 0)
      pointer(panel, 'pointermove', 200, 200, 100)
      pointer(panel, 'pointermove', 200, 400, 200)
      pointer(panel, 'pointerup', 200, 400, 200)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves the sheet alone when the gesture starts in its body', async () => {
    const onClose = vi.fn()
    const { container } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    const panel = container.querySelector('.sheet')
    const body = container.querySelector('.sheet-body')
    prepPanel(panel)

    await act(async () => {
      pointer(body, 'pointerdown', 200, 100, 0)
      pointer(panel, 'pointermove', 200, 400, 100)
      pointer(panel, 'pointerup', 200, 400, 100)
    })

    // A scrollable body must keep its scroll; ColorField must keep its drags
    expect(panel.style.transform).toBe('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not drag on the tablet, where there is no handle to grab', async () => {
    window.matchMedia = (q) => ({
      matches: true, media: q, onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })
    const onClose = vi.fn()
    const { container } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    const panel = container.querySelector('.sheet')
    const grab = container.querySelector('.sheet-grab')
    prepPanel(panel)

    await act(async () => {
      pointer(grab, 'pointerdown', 200, 0, 0)
      pointer(panel, 'pointermove', 200, 200, 100)
      pointer(panel, 'pointermove', 200, 400, 200)
      pointer(panel, 'pointerup', 200, 400, 200)
    })

    expect(panel.style.transform).toBe('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still closes instantly on Escape', async () => {
    const onClose = vi.fn()
    render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('still closes instantly on a scrim tap', async () => {
    const onClose = vi.fn()
    const { container } = render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    await act(async () => {
      fireEvent.click(container.querySelector('.sheet-scrim'))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the close button working', async () => {
    const onClose = vi.fn()
    render(<Sheet open title="T" onClose={onClose}>body</Sheet>)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
