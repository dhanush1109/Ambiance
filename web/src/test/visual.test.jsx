/**
 * Tests for the premium pass: the mini car preview, the drift control, the
 * haptic vocabulary, and the colour presets.
 *
 * Kept separate from app.test.jsx so the core behaviour suite stays readable.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { act } from 'react'

import MiniCar from '../components/MiniCar'
import MoodCard from '../components/MoodCard'
import FavoriteCard from '../components/FavoriteCard'
import ColorField from '../components/ColorField'
import HomeScreen from '../screens/HomeScreen'
import { BODY_D, CABIN_CHROME, PIECES } from '../data/pieces'
import { MOODS } from '../data/moods'
import { haptics } from '../services/haptics'
import { controller } from '../services/controller'
import { mockTransport, sentLog } from '../services/mockTransport'
import { _setTransport } from '../services/transport'
import { _resetQueue } from '../services/commandQueue'
import { ambient } from '../engine/ambientEngine'
import { useLightStore } from '../state/lightStore'
import { useConnectionStore } from '../state/connectionStore'
import { useSettingsStore, SETTING_META } from '../state/settingsStore'
import { useUiStore } from '../state/uiStore'

beforeEach(async () => {
  _setTransport(mockTransport)
  _resetQueue()
  sentLog.length = 0
  await mockTransport.disconnect()
  useConnectionStore.getState().reset()
  useUiStore.setState({ tab: 'home', toast: null })
  useSettingsStore.setState({
    haptics: true,
    welcomeAnimation: false,
    autoReconnect: false,
    timeOfDayTheme: false,
  })
  useLightStore.setState({ driftOn: false, activeMode: null, activeMoodId: null })
  window.matchMedia = window.matchMedia || ((q) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
})

afterEach(() => {
  ambient.stop('test') // never leave a drift timer running
  cleanup()
  delete navigator.vibrate
})

describe('MiniCar', () => {
  it('draws all 19 pieces with no filters', () => {
    const { container } = render(<MiniCar z1="#ff0000" z2="#0000ff" />)
    expect(container.querySelectorAll('.mini-lit')).toHaveLength(19)
    expect(container.querySelectorAll('filter')).toHaveLength(0)
  })

  it('stays out of the accessibility tree', () => {
    // It sits next to a name that already says what the mood is, and its
    // labels would otherwise collide with the real cabin map's hit regions.
    const { container } = render(<MiniCar z1="#ff0000" z2="#0000ff" />)
    const svg = container.querySelector('[data-minicar]')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('[aria-label], [tabindex], [role]')).toHaveLength(0)
  })
})

describe('cards', () => {
  it('previews the mood on the actual car', () => {
    const { container } = render(<MoodCard mood={MOODS[0]} />)
    expect(container.querySelector('[data-minicar]')).toBeTruthy()
  })

  it('keeps favourites compact â€” no car in the list rows', () => {
    const fav = {
      id: 'f1', name: 'Test', createdAt: 0, mode: null,
      z1: { hex: '#ff0000', brightness: 7 },
      z2: { hex: '#0000ff', brightness: 4 },
    }
    const { container } = render(<FavoriteCard fav={fav} />)
    expect(container.querySelector('[data-minicar]')).toBeNull()
  })
})

describe('colour presets', () => {
  it('offers eight one-tap colours that commit immediately', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<ColorField hex="#ff8a3d" onChange={onChange} onCommit={onCommit} />)

    const group = screen.getByRole('group', { name: /preset colours/i })
    expect(group.querySelectorAll('button')).toHaveLength(8)

    fireEvent.click(screen.getByLabelText(/set colour to ice blue/i))
    expect(onChange).toHaveBeenCalledWith('#9fe4ff')
    expect(onCommit).toHaveBeenCalledWith('#9fe4ff')
  })
})

describe('drift', () => {
  it('is offered on Home but disabled until the car is connected', async () => {
    await act(async () => { render(<HomeScreen />) })
    expect(screen.getByRole('button', { name: /^drift$/i }).disabled).toBe(true)
  })

  it('starts and stops from the chip', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { render(<HomeScreen />) })

    const chip = screen.getByRole('button', { name: /^drift$/i })
    await act(async () => { fireEvent.click(chip) })

    expect(useLightStore.getState().driftOn).toBe(true)
    expect(ambient.current()).toBe('drift')
    expect(chip.getAttribute('aria-pressed')).toBe('true')

    await act(async () => { fireEvent.click(chip) })
    expect(useLightStore.getState().driftOn).toBe(false)
  })

  it('hands control back the moment you touch a colour', async () => {
    await act(async () => { await controller.connectPinned() })
    await act(async () => { ambient.start('drift') })
    expect(useLightStore.getState().driftOn).toBe(true)

    await act(async () => { controller.setColor(1, '#112233') })

    await waitFor(() => expect(useLightStore.getState().driftOn).toBe(false))
    expect(ambient.isRunning()).toBe(false)
  })
})

describe('haptics', () => {
  it('scales the pattern with how rare the event is', () => {
    navigator.vibrate = vi.fn()
    haptics.tick()
    haptics.tap()
    haptics.success()
    expect(navigator.vibrate).toHaveBeenNthCalledWith(1, 8)
    expect(navigator.vibrate).toHaveBeenNthCalledWith(2, 15)
    expect(navigator.vibrate).toHaveBeenNthCalledWith(3, [10, 30, 20])
  })

  it('stays silent when the setting is off', () => {
    navigator.vibrate = vi.fn()
    useSettingsStore.setState({ haptics: false })
    haptics.tap()
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })

  it('does nothing on a device with no vibration motor', () => {
    delete navigator.vibrate
    expect(() => haptics.success()).not.toThrow()
  })

  it('fires the success pattern when the car connects', async () => {
    navigator.vibrate = vi.fn()
    await act(async () => { await controller.connectPinned() })
    expect(navigator.vibrate).toHaveBeenCalledWith([10, 30, 20])
  })

  it('never fires during a colour drag', async () => {
    await act(async () => { await controller.connectPinned() })
    navigator.vibrate = vi.fn()
    await act(async () => {
      for (let i = 0; i < 20; i += 1) controller.setColor(1, '#ff0000')
    })
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })

  it('is exposed as a user setting', () => {
    expect(SETTING_META.find((m) => m.key === 'haptics')).toBeTruthy()
  })
})

describe('car geometry v2', () => {
  it('exports one shared body outline', () => {
    expect(BODY_D.startsWith('M210 24')).toBe(true)
    expect(BODY_D.trim().endsWith('Z')).toBe(true)
  })

  it('still draws four door panels', () => {
    const ids = CABIN_CHROME.map((s) => s.id)
    for (const d of ['door-fl', 'door-fr', 'door-rl', 'door-rr']) {
      expect(ids).toContain(d)
    }
    expect(ids).toContain('body')
  })

  it('keeps every lit strip a straight line the renderer can fatten', () => {
    for (const p of PIECES.filter((x) => x.kind === 'strip')) {
      expect(p.d).toMatch(/^M[\d.\s]+L[\d.\s]+$/)
    }
  })
})
