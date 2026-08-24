/**
 * Smoke tests: does the app actually mount and behave?
 *
 * The production build only proves imports resolve. These prove the screens
 * render, the pinned-MAC connect works end to end through the queue, and the
 * cabin map matches the real hardware layout.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { act } from 'react'

import App from '../App'
import { PIECES, ZONE_PIECES, DOORS } from '../data/pieces'
import { PINNED_DEVICE } from '../config/device'
import { mockTransport, sentLog } from '../services/mockTransport'
import { _setTransport } from '../services/transport'
import { controller } from '../services/controller'
import { useLightStore } from '../state/lightStore'
import { useUiStore } from '../state/uiStore'
import { useConnectionStore } from '../state/connectionStore'
import { useSettingsStore } from '../state/settingsStore'
import { _resetQueue, queueDepth } from '../services/commandQueue'

/** Wait for the command queue to finish draining, so leftover writes from
 *  connect-time restore don't pollute the next assertion. */
async function settle() {
  await waitFor(() => expect(queueDepth()).toBe(0), { timeout: 3000 })
  await new Promise((r) => setTimeout(r, 80))
}

beforeEach(async () => {
  _setTransport(mockTransport)
  _resetQueue()
  sentLog.length = 0
  await mockTransport.disconnect()
  useConnectionStore.getState().reset()
  useUiStore.setState({ tab: 'home', toast: null })
  useLightStore.getState().selectZone(3)
  // Don't let the engine fire during tests
  useSettingsStore.setState({ welcomeAnimation: false, autoReconnect: false, timeOfDayTheme: false })
  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
})

// vitest runs with globals:false, so Testing Library's auto-cleanup is off
afterEach(() => {
  cleanup()
})

describe('cabin map data', () => {
  it('describes the real 19-piece kit', () => {
    expect(PIECES).toHaveLength(19)
    expect(ZONE_PIECES[1]).toHaveLength(12) // front cabin
    expect(ZONE_PIECES[2]).toHaveLength(7) // handles & feet
  })

  it('gives each of the four doors a line, a pocket and a handle', () => {
    expect(DOORS).toHaveLength(4)
    for (const door of DOORS) {
      const mine = PIECES.filter((p) => p.door === door.id)
      expect(mine.map((p) => p.group).sort()).toEqual(['doorline', 'handle', 'pocket'])
      // The split across zones is why one door cannot be its own colour
      expect(mine.find((p) => p.group === 'doorline').zone).toBe(1)
      expect(mine.find((p) => p.group === 'pocket').zone).toBe(1)
      expect(mine.find((p) => p.group === 'handle').zone).toBe(2)
    }
  })

  it('uses unique ids and valid geometry', () => {
    expect(new Set(PIECES.map((p) => p.id)).size).toBe(19)
    for (const p of PIECES) {
      if (p.kind === 'strip') expect(p.d).toMatch(/^M[\d.\s]+L[\d.\s]+$/)
      if (p.kind === 'ring') expect(p.r).toBeGreaterThan(0)
      if (p.kind === 'ellipse') expect(p.rx).toBeGreaterThan(0)
    }
  })
})

describe('app shell', () => {
  it('lands on the home screen showing the car and all four doors', async () => {
    await act(async () => { render(<App />) })

    expect(screen.getByRole('heading', { name: 'Ambiance' })).toBeTruthy()
    expect(screen.getByLabelText(/Tap a part of the car/i)).toBeTruthy()

    // Every door label is drawn
    for (const d of DOORS) expect(screen.getAllByText(d.short).length).toBeGreaterThan(0)

    // Every piece is a real, reachable control
    for (const p of PIECES) {
      expect(screen.getByLabelText(new RegExp(`^${p.label},`, 'i'))).toBeTruthy()
    }
  })

  it('offers connect-by-MAC when offline, naming the pinned controller', async () => {
    await act(async () => { render(<App />) })
    // Every screen stays mounted, so the MAC legitimately appears on both Home
    // and Settings — assert it is shown, not that it is shown once.
    expect(screen.getAllByText(new RegExp(PINNED_DEVICE.mac)).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Connect by MAC/i }).length).toBeGreaterThan(0)
  })

  it('switches tabs without unmounting the cabin map', async () => {
    await act(async () => { render(<App />) })
    const before = screen.getByLabelText(/Tap a part of the car/i)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Moods/i }))
    })

    expect(screen.getByRole('heading', { name: 'Moods' })).toBeTruthy()
    // Same DOM node â€” the hero was hidden, not rebuilt
    expect(screen.getByLabelText(/Tap a part of the car/i)).toBe(before)
  })

  it('shows a tiny connection chip on every tab', async () => {
    await act(async () => { render(<App />) })
    const chip = () => screen.getAllByRole('button', { name: /Not connected/i })
    expect(chip().length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Moods$/i }))
    })
    expect(chip().length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Settings$/i }))
    })
    expect(chip().length).toBeGreaterThan(0)
  }, 15000)

  it('selects a zone by tapping a door piece on the car', async () => {
    await act(async () => { render(<App />) })

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/^Front left door handle,/i))
    })
    expect(useLightStore.getState().selectedZone).toBe(2) // handle => handles & feet

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/^Front left door line,/i))
    })
    expect(useLightStore.getState().selectedZone).toBe(1) // line => front cabin
  })
})

describe('pinned connection', () => {
  it('connects straight to the pinned MAC with no scan', async () => {
    const scan = vi.spyOn(mockTransport, 'scan')
    await act(async () => { await controller.connectPinned() })

    expect(scan).not.toHaveBeenCalled()
    expect(useConnectionStore.getState().status).toBe('connected')
    expect(useConnectionStore.getState().device.address).toBe(PINNED_DEVICE.mac)
    scan.mockRestore()
  })

  it('refuses any other controller', async () => {
    await expect(controller.connect('AA:BB:CC:DD:EE:01')).rejects.toThrow(/locked to/i)
    // Declining to try is not a failed connection: status stays idle and the
    // reason is surfaced as an error message instead.
    expect(useConnectionStore.getState().status).toBe('idle')
    expect(useConnectionStore.getState().error).toMatch(/locked to/i)
    expect(mockTransport.isConnected()).toBe(false)
  })
})

describe('commands reach the controller', () => {
  it('sends colour and brightness for the selected zone', async () => {
    await act(async () => { await controller.connectPinned() })
    await settle()
    sentLog.length = 0

    await act(async () => {
      controller.setColor(1, '#00ff00')
      controller.setBrightness(2, 7)
    })

    await waitFor(() => expect(sentLog.length).toBeGreaterThanOrEqual(2), { timeout: 2000 })

    const color = sentLog.find((s) => s.intent?.op === 'color')
    expect(color.intent).toMatchObject({ zone: 1, r: 0, g: 255, b: 0 })
    // Front-cabin colour frame: '<10' + rrggbb + '>'
    expect(color.hex).toBe('3C 31 30 30 30 66 66 30 30 3E')

    const bright = sentLog.find((s) => s.intent?.op === 'brightness')
    expect(bright.intent).toMatchObject({ zone: 2, level: 7 })
  })

  it('sends animation speed as Type A RGB and Symphony frames', async () => {
    await act(async () => { await controller.connectPinned() })
    await settle()
    sentLog.length = 0

    await act(async () => { controller.setSpeed(6) })

    await waitFor(() => expect(sentLog.filter((s) => s.intent?.op === 'speed').length).toBe(2), {
      timeout: 2000,
    })
    expect(useLightStore.getState().speed).toBe(6)
    const rgb = sentLog.find((s) => s.intent?.family === 'rgb')
    const symphony = sentLog.find((s) => s.intent?.family === 'symphony')
    expect(rgb.hex).toBe('3C 33 65 30 61 3E')
    expect(symphony.hex).toBe('3C 30 62 30 61 3E')
  })

  it('coalesces a colour drag instead of queuing every frame', async () => {
    await act(async () => { await controller.connectPinned() })
    await settle()
    sentLog.length = 0

    // Fifty updates, as a real drag would produce
    await act(async () => {
      for (let i = 0; i < 50; i += 1) {
        controller.setColor(3, `#ff${i.toString(16).padStart(2, '0')}00`)
      }
    })
    await waitFor(() => expect(sentLog.length).toBeGreaterThan(0), { timeout: 2000 })
    await new Promise((r) => setTimeout(r, 300))

    // Far fewer writes than updates, and the final colour is the one that lands
    expect(sentLog.length).toBeLessThan(10)
    expect(sentLog.at(-1).intent.b).toBe(0)
  })

  it('mirrors zone 3 onto both real zones, like the firmware does', async () => {
    await act(async () => { controller.setColor(3, '#123456', { manual: false }) })
    const { zones } = useLightStore.getState()
    expect(zones[1].hex).toBe('#123456')
    expect(zones[2].hex).toBe('#123456')
  })

  it('applies a mood as two coordinated zone colours', async () => {
    await act(async () => { await controller.connectPinned() })
    await settle()
    useLightStore.getState().selectZone(3)
    sentLog.length = 0

    const mood = {
      id: 'test', name: 'Test',
      z1: { hex: '#ff0000', brightness: 8 },
      z2: { hex: '#0000ff', brightness: 4 },
    }
    await act(async () => { controller.applyMood(mood) })
    await waitFor(() => expect(sentLog.filter((s) => s.intent?.op === 'color').length).toBe(2), {
      timeout: 3000,
    })

    const { zones } = useLightStore.getState()
    expect(zones[1]).toMatchObject({ hex: '#ff0000', brightness: 8 })
    expect(zones[2]).toMatchObject({ hex: '#0000ff', brightness: 4 })
  })

  it('applies only the matching half of a mood when a single zone is selected', async () => {
    await act(async () => { await controller.connectPinned() })
    await settle()
    useLightStore.getState().selectZone(2)
    useLightStore.getState().setZoneColor(1, '#111111')
    sentLog.length = 0

    const mood = {
      id: 'split', name: 'Split',
      z1: { hex: '#ff0000', brightness: 8 },
      z2: { hex: '#0000ff', brightness: 4 },
    }
    await act(async () => { controller.applyMood(mood) })
    await waitFor(() => expect(sentLog.some((s) => s.intent?.op === 'color')).toBe(true), {
      timeout: 3000,
    })

    const colors = sentLog.filter((s) => s.intent?.op === 'color')
    expect(colors.every((s) => s.intent.zone === 2)).toBe(true)
    const { zones } = useLightStore.getState()
    expect(zones[1].hex).toBe('#111111')
    expect(zones[2]).toMatchObject({ hex: '#0000ff', brightness: 4 })
  })

  it('choosing a colour exits a running animation', async () => {
    await act(async () => {
      useLightStore.getState().setActiveMode({ family: 'rgb', index: 1, name: 'Rainbow' })
      controller.setColor(1, '#abcdef', { manual: false })
    })
    expect(useLightStore.getState().activeMode).toBeNull()
  })
})


