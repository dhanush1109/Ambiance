/**
 * Edge and corner cases: hardware back, modal scroll lock, empty scan results,
 * and the time-of-day scheduler's stand-down rules.
 */
// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { act } from 'react'

import App from '../App'
import Sheet from '../components/Sheet'
import ColorField from '../components/ColorField'
import AmbientBackdrop from '../components/AmbientBackdrop'
import HomeScreen from '../screens/HomeScreen'
import SettingsScreen from '../screens/SettingsScreen'
import { hslToHex, hexToHsl, rotateHue, mixHex } from '../engine/color'
import { hexToRgb } from '../protocol/hex'
import { MOODS } from '../data/moods'
import { backAction, handleBackButton } from '../services/backButton'
import { shouldReapply } from '../engine/timeOfDayScheduler'
import { controller } from '../services/controller'
import { mockTransport, sentLog } from '../services/mockTransport'
import { _setTransport } from '../services/transport'
import { _resetQueue } from '../services/commandQueue'
import { useUiStore } from '../state/uiStore'
import { useConnectionStore } from '../state/connectionStore'
import { useLightStore } from '../state/lightStore'
import { useSettingsStore } from '../state/settingsStore'
import { ambient } from '../engine/ambientEngine'

beforeEach(async () => {
  _setTransport(mockTransport)
  _resetQueue()
  sentLog.length = 0
  await mockTransport.disconnect()
  useConnectionStore.getState().reset()
  useUiStore.setState({ tab: 'home', toast: null, sheets: [] })
  useSettingsStore.setState({ autoReconnect: false, welcomeAnimation: false, timeOfDayTheme: false })
  document.body.style.overflow = ''
  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
})

afterEach(() => {
  ambient.stop('test')
  cleanup()
  document.body.style.overflow = ''
})

describe('hardware back button', () => {
  it('prefers closing a sheet, then going home, then minimising', () => {
    expect(backAction({ sheetCount: 1, tab: 'settings' })).toBe('close-sheet')
    expect(backAction({ sheetCount: 1, tab: 'home' })).toBe('close-sheet')
    expect(backAction({ sheetCount: 0, tab: 'effects' })).toBe('go-home')
    expect(backAction({ sheetCount: 0, tab: 'home' })).toBe('minimize')
  })

  it('closes an open sheet instead of leaving the app', async () => {
    const onClose = vi.fn()
    const minimizeApp = vi.fn(() => Promise.resolve())
    await act(async () => {
      render(<Sheet open title="Rename" onClose={onClose}>body</Sheet>)
    })

    await act(async () => { handleBackButton({ minimizeApp }) })

    expect(onClose).toHaveBeenCalled()
    expect(minimizeApp).not.toHaveBeenCalled()
  })

  it('returns to Home from another tab rather than leaving', async () => {
    const minimizeApp = vi.fn(() => Promise.resolve())
    useUiStore.setState({ tab: 'effects' })

    await act(async () => { handleBackButton({ minimizeApp }) })

    expect(useUiStore.getState().tab).toBe('home')
    expect(minimizeApp).not.toHaveBeenCalled()
  })

  it('minimises from Home — never kills the app outright', async () => {
    const minimizeApp = vi.fn(() => Promise.resolve())
    await act(async () => { handleBackButton({ minimizeApp }) })
    expect(minimizeApp).toHaveBeenCalled()
  })
})

describe('sheet', () => {
  it('stops the page behind it scrolling, and restores after', async () => {
    document.body.style.overflow = 'auto'

    const { rerender } = render(<Sheet open title="T" onClose={() => {}}>x</Sheet>)
    expect(document.body.style.overflow).toBe('hidden')

    await act(async () => {
      rerender(<Sheet open={false} title="T" onClose={() => {}}>x</Sheet>)
    })
    // restored to what it was before, not blanked
    expect(document.body.style.overflow).toBe('auto')
  })

  it('releases the scroll lock when unmounted while still open', async () => {
    const { unmount } = render(<Sheet open title="T" onClose={() => {}}>x</Sheet>)
    expect(document.body.style.overflow).toBe('hidden')
    await act(async () => { unmount() })
    expect(document.body.style.overflow).toBe('')
  })

  it('registers itself so back can find it, and deregisters on close', async () => {
    const { rerender } = render(<Sheet open title="T" onClose={() => {}}>x</Sheet>)
    expect(useUiStore.getState().sheets).toHaveLength(1)

    await act(async () => {
      rerender(<Sheet open={false} title="T" onClose={() => {}}>x</Sheet>)
    })
    expect(useUiStore.getState().sheets).toHaveLength(0)
  })
})

describe('scan results', () => {
  it('explains itself when a scan finds nothing', async () => {
    const scan = vi.spyOn(mockTransport, 'scan').mockResolvedValue([])
    await act(async () => { render(<SettingsScreen />) })

    // nothing claimed before the user has actually scanned
    expect(screen.queryByText(/Nothing found/i)).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /scan for nearby devices/i }))
    })

    await waitFor(() => expect(screen.getByText(/Nothing found/i)).toBeTruthy())
    scan.mockRestore()
  })

  it('lists what it finds', async () => {
    await act(async () => { render(<SettingsScreen />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /scan for nearby devices/i }))
    })

    await waitFor(() => expect(screen.getByText(/ATW-FWD-AAA6/)).toBeTruthy())
    expect(screen.queryByText(/Nothing found/i)).toBeNull()
  })
})

/**
 * Regression guard for a shipped bug: ColorField carried its own copy of the
 * HSL maths with lightness on a 0-1 scale while everything else used 0-100.
 * It emitted strings like "#-3c25cc53d61"; hexToRgb throws on those, so
 * dragging the picker failed to change the lights at all.
 *
 * The round-trip and "never throws" cases below both catch it immediately.
 */
describe('colour maths', () => {
  const HUES = [0, 24, 60, 120, 180, 200, 240, 300, 359]
  const SATS = [0, 1, 35, 80, 100]
  const LIGHTS = [8, 20, 50, 62, 96]

  it('always produces a parseable #rrggbb, across the whole space', () => {
    for (const h of HUES) {
      for (const s of SATS) {
        for (const l of LIGHTS) {
          const out = hslToHex(h, s, l)
          expect(out, `hslToHex(${h},${s},${l})`).toMatch(/^#[0-9a-f]{6}$/i)
          // the real consumer: this throws on anything malformed
          expect(() => hexToRgb(out)).not.toThrow()
        }
      }
    }
  })

  it('round-trips a colour back to itself', () => {
    for (const hex of ['#ff8a3d', '#9fe4ff', '#63e6a4', '#a341ff', '#ffffff', '#000000']) {
      const { h, s, l } = hexToHsl(hex)
      const back = hslToHex(h, s, l)
      const a = hexToRgb(hex)
      const b = hexToRgb(back)
      // within a rounding step per channel
      expect(Math.abs(a.r - b.r), `${hex} red`).toBeLessThanOrEqual(2)
      expect(Math.abs(a.g - b.g), `${hex} green`).toBeLessThanOrEqual(2)
      expect(Math.abs(a.b - b.b), `${hex} blue`).toBeLessThanOrEqual(2)
    }
  })

  it('keeps drift and blends inside the valid range', () => {
    let c = '#ff8a3d'
    for (let i = 0; i < 60; i += 1) {
      c = rotateHue(c, 7)
      expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(mixHex('#3a241a', '#9fe4ff', t)).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('ships only valid colours in the mood presets', () => {
    for (const m of MOODS) {
      expect(m.z1.hex, m.name).toMatch(/^#[0-9a-f]{6}$/i)
      expect(m.z2.hex, m.name).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('shows a real hex in the picker readout', () => {
    // The bug was visible right here, on screen, as "#-3C25CC53D61"
    const { container } = render(<ColorField hex="#ff8a3d" onChange={() => {}} onCommit={() => {}} />)
    const readout = container.querySelector('.colorfield-value')
    expect(readout.textContent).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('emits a usable colour when the pad is dragged', () => {
    const seen = []
    const { container } = render(
      <ColorField hex="#ff8a3d" onChange={(v) => seen.push(v)} onCommit={(v) => seen.push(v)} />,
    )
    const pad = container.querySelector('.colorfield-pad')
    pad.setPointerCapture = () => {}
    pad.releasePointerCapture = () => {}
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 160 })

    // jsdom implements no PointerEvent, and Testing Library's fallback drops
    // clientX/clientY. MouseEvent does carry them, and the handlers only read
    // coordinates, so this exercises the real drag path.
    const drag = (type, clientX, clientY) =>
      fireEvent(pad, new MouseEvent(type, { bubbles: true, clientX, clientY }))

    drag('pointerdown', 210, 40)
    drag('pointermove', 60, 120)
    drag('pointerup', 60, 120)

    expect(seen.length).toBeGreaterThan(0)
    for (const v of seen) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/i)
      expect(() => hexToRgb(v)).not.toThrow()
    }
    // The drag actually moved the colour, rather than silently no-opping
    expect(seen.some((v) => v.toLowerCase() !== '#ff8a3d')).toBe(true)
  })

  it('ignores a pointer event with no usable coordinates', () => {
    // Guards the NaN path: better to do nothing than emit "#NaNNaNNaN",
    // which throws the moment it reaches the controller.
    const seen = []
    const { container } = render(
      <ColorField hex="#ff8a3d" onChange={(v) => seen.push(v)} onCommit={(v) => seen.push(v)} />,
    )
    const pad = container.querySelector('.colorfield-pad')
    pad.setPointerCapture = () => {}
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 160 })

    fireEvent.pointerDown(pad, { pointerId: 1 }) // no coordinates at all

    for (const v of seen) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('keyboard adjustment also stays valid', () => {
    const seen = []
    const { container } = render(
      <ColorField hex="#ff8a3d" onChange={(v) => seen.push(v)} onCommit={(v) => seen.push(v)} />,
    )
    const pad = container.querySelector('.colorfield-pad')
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      for (let i = 0; i < 40; i += 1) fireEvent.keyDown(pad, { key })
    }
    const hue = container.querySelector('.colorfield-hue')
    for (let i = 0; i < 80; i += 1) fireEvent.keyDown(hue, { key: 'ArrowRight' })

    expect(seen.length).toBeGreaterThan(0)
    for (const v of seen) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('time-of-day scheduler', () => {
  const base = {
    enabled: true,
    connected: true,
    visible: true,
    engineRunning: false,
    activeMode: null,
    lastManualAt: 0,
    baseline: 0,
  }

  it('re-applies on a quiet, connected, visible session', () => {
    expect(shouldReapply(base)).toBe(true)
  })

  it('stands down for the session once the driver picks a colour', () => {
    // The whole point: never overwrite a deliberate choice, however long ago
    expect(shouldReapply({ ...base, lastManualAt: 5_000, baseline: 0 })).toBe(false)
  })

  it('leaves drift and firmware animations alone', () => {
    expect(shouldReapply({ ...base, engineRunning: true })).toBe(false)
    expect(shouldReapply({ ...base, activeMode: { family: 'rgb', index: 1, name: 'x' } })).toBe(false)
  })

  it('does nothing when disabled, disconnected or backgrounded', () => {
    expect(shouldReapply({ ...base, enabled: false })).toBe(false)
    expect(shouldReapply({ ...base, connected: false })).toBe(false)
    expect(shouldReapply({ ...base, visible: false })).toBe(false)
  })
})

describe('colour picker behind a button', () => {
  it('is closed by default, and opens the sheet on tap', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { render(<HomeScreen />) })

    expect(screen.queryByRole('dialog', { name: 'Colour' })).toBeNull()

    const button = screen.getByRole('button', { name: /^colour, currently/i })
    await act(async () => { fireEvent.click(button) })

    expect(screen.getByRole('dialog', { name: 'Colour' })).toBeTruthy()
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes and returns focus to the button', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { render(<HomeScreen />) })

    const button = screen.getByRole('button', { name: /^colour, currently/i })
    // jsdom doesn't focus a button on a bare click event the way a real
    // browser does on mousedown — focus it explicitly, as a real tap would,
    // so the restore-on-close behaviour is actually exercised.
    button.focus()
    await act(async () => { fireEvent.click(button) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    })

    expect(screen.queryByRole('dialog', { name: 'Colour' })).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('a preset picked inside the sheet drives the selected zone', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { render(<HomeScreen />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^colour, currently/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/set colour to rose/i))
    })

    await waitFor(() =>
      expect(sentLog.find((s) => s.intent?.op === 'color')).toBeTruthy(),
    )
    const sent = sentLog.find((s) => s.intent?.op === 'color')
    expect(sent.intent).toMatchObject({ zone: useLightStore.getState().selectedZone })
    expect(useLightStore.getState().zones[sent.intent.zone].hex.toLowerCase()).toBe('#ff6fa5')
  })

  it('the hardware back button closes the sheet, not Home', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { render(<HomeScreen />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^colour, currently/i }))
    })
    expect(useUiStore.getState().sheets.length).toBeGreaterThan(0)

    await act(async () => { handleBackButton({ minimizeApp: async () => {} }) })

    expect(screen.queryByRole('dialog', { name: 'Colour' })).toBeNull()
    expect(useUiStore.getState().tab).toBe('home') // back closed the sheet, didn't navigate
  })

  it('picking a different zone closes an open picker', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { render(<HomeScreen />) })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^colour, currently/i }))
    })
    expect(screen.getByRole('dialog', { name: 'Colour' })).toBeTruthy()

    // "Front cabin" also appears in every door hit-region's aria-label on the
    // car itself, so scope the query to the zone chips specifically.
    const zoneGroup = screen.getByRole('group', { name: /light zone/i })
    await act(async () => {
      fireEvent.click(within(zoneGroup).getByRole('button', { name: /front cabin/i }))
    })

    expect(screen.queryByRole('dialog', { name: 'Colour' })).toBeNull()
  })

  it('brightness and power stay reachable without opening the picker', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { render(<HomeScreen />) })

    // Neither control should be hidden behind the closed colour sheet
    expect(screen.getByRole('slider', { name: /brightness/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /turn cabin lights/i })).toBeTruthy()
  })
})

describe('no page-wide horizontal scroll', () => {
  it('clips overflow at the document root without breaking sticky elements', () => {
    // jsdom has no layout engine, so this is a source-level guard for the fix
    // (the wash in CarHero.css bleeds 16% past the car on purpose) — the
    // visual check happens on device. `clip`, not `hidden`, is the point:
    // `hidden` would create a scroll container and break `position: sticky`
    // on the floating dock and the tablet's car pane.
    const tokens = readFileSync(
      path.resolve(process.cwd(), 'src/theme/tokens.css'),
      'utf8',
    )
    expect(tokens).toMatch(/overflow-x:\s*clip/)
    expect(tokens).not.toMatch(/overflow-x:\s*hidden/)
  })
})

/**
 * Regression guard for the whole point of the premium redesign: the app used
 * to rewrite --accent itself, so it turned orange whenever the cabin lights
 * were orange. --accent is now a fixed indigo the app never touches; --light
 * is the only thing that follows the cabin colour.
 */
describe('fixed accent vs live light colour', () => {
  it('never writes --accent, only --light, when the cabin colour changes', async () => {
    await act(async () => { render(<App />) })
    const root = document.documentElement

    expect(root.style.getPropertyValue('--accent')).toBe('')

    await act(async () => {
      const zone = useLightStore.getState().selectedZone
      useLightStore.getState().setZoneColor(zone, '#00ff88')
    })

    expect(root.style.getPropertyValue('--light')).toBe('#00ff88')
    // still never written — the app's tint colour is not up for negotiation
    expect(root.style.getPropertyValue('--accent')).toBe('')
  })
})

describe('Apple Liquid Glass redesign', () => {
  it('the ambient backdrop is decorative, not a real UI element', () => {
    const { container } = render(<AmbientBackdrop />)
    const el = container.querySelector('.ambient-backdrop')
    expect(el.getAttribute('aria-hidden')).toBe('true')
  })

  it('glass surfaces actually declare a blur, well past the old 3-surface budget', () => {
    // Most surfaces are hand-rolled per component (cascade-order safety, see
    // the file-by-file notes), so the real count spans many files, not just
    // the shared primitives in glass.css.
    const files = [
      'theme/glass.css',
      'components/StatusPill.css',
      'components/Toast.css',
      'components/ControlDock.css',
      'screens/screens.css',
      'screens/settings.css',
      'screens/HomeScreen.css',
    ]
    let hits = 0
    for (const f of files) {
      const css = readFileSync(path.resolve(process.cwd(), `src/${f}`), 'utf8')
      hits += (css.match(/backdrop-filter:\s*blur/g) ?? []).length
    }
    expect(hits).toBeGreaterThan(10)
  })

  it("honours the OS Reduce Transparency setting, not just the app's own toggle", () => {
    const glass = readFileSync(path.resolve(process.cwd(), 'src/theme/glass.css'), 'utf8')
    expect(glass).toMatch(/prefers-reduced-transparency/)
  })

  it('resolves the interface to Inter, bundled rather than fetched', () => {
    const tokens = readFileSync(path.resolve(process.cwd(), 'src/theme/tokens.css'), 'utf8')
    expect(tokens).toMatch(/--font-body:\s*"Inter"/)

    const main = readFileSync(path.resolve(process.cwd(), 'src/main.jsx'), 'utf8')
    expect(main).toMatch(/@fontsource\/inter/)
    expect(main).not.toMatch(/@fontsource\/outfit|@fontsource\/work-sans/)
  })

  it('never glasses a control that already lives on the glass dock', () => {
    // "Never glass on glass" — ColorButton, Brightness and PowerButton all
    // sit inside ControlDock, which is already glass; they must be vibrancy
    // fills, not another blurred layer.
    for (const file of ['ColorButton.css', 'Brightness.css', 'PowerButton.css']) {
      const css = readFileSync(
        path.resolve(process.cwd(), `src/components/${file}`),
        'utf8',
      )
      expect(css, file).not.toMatch(/backdrop-filter/)
      expect(css, file).toMatch(/var\(--fill-/)
    }
  })
})
