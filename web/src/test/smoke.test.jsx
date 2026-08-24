// @vitest-environment jsdom
// Boots the real App, walks every tab, opens a sheet, drives the controls.
// Any runtime error, bad import or crashing render surfaces here.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { act } from 'react'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
import App from '../App'
import { controller } from '../services/controller'
import { mockTransport } from '../services/mockTransport'
import { _setTransport } from '../services/transport'
import { _resetQueue } from '../services/commandQueue'
import { useConnectionStore } from '../state/connectionStore'
import { useSettingsStore } from '../state/settingsStore'
import { useUiStore } from '../state/uiStore'

beforeEach(async () => {
  _setTransport(mockTransport); _resetQueue()
  await mockTransport.disconnect()
  useConnectionStore.getState().reset()
  useUiStore.setState({ tab: 'home', toast: null, sheets: [] })
  useSettingsStore.setState({ autoReconnect: false, welcomeAnimation: false, timeOfDayTheme: false })
  window.matchMedia = window.matchMedia || ((q) => ({ matches:false, media:q, onchange:null,
    addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent:()=>false }))
})

describe('end-to-end smoke', () => {
  it('boots, connects, and every screen renders without error', { timeout: 60000 }, async () => {
    const errors = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')))

    await act(async () => { render(<App />) })
    await act(async () => { await controller.connectPinned() })
    expect(useConnectionStore.getState().status).toBe('connected')

    for (const tab of [/^Moods$/i, /^Effects$/i, /^Saved$/i, /^Settings$/i, /^Home$/i]) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: tab })) })
    }

    // open + close the colour sheet
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^colour, currently/i }))
    })
    expect(screen.getByRole('dialog', { name: 'Colour' })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/set colour to violet/i))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^close$/i }))
    })
    expect(screen.queryByRole('dialog', { name: 'Colour' })).toBeNull()

    // power + a zone tap on the car
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /turn cabin lights/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/^Front left door handle,/i))
    })

    const real = errors.filter((e) => !/not wrapped in act|ReactDOMTestUtils/i.test(e))
    expect(real, `console errors:\n${real.join('\n')}`).toHaveLength(0)
    spy.mockRestore()
  })
})
