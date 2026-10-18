import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import {
  parseCgi,
  parseDeviceAttr,
  parseWorkState,
  parseSdStatus,
  parseWifi,
  buildStatus,
  isPinnedCamera,
  normalizeCameraName,
  formatFirmware,
} from '../services/dashcamProtocol'
import {
  streamUrls,
  readDirect,
  readRelay,
  command,
  isDirectBlocked,
  pair,
  unpair,
  getPairCode,
  relayUrl,
  PairingRequiredError,
} from '../services/dashcamApi'
import { useDashcamStore, isLive, statusAge } from '../state/dashcamStore'
import { TABS, useUiStore } from '../state/uiStore'
import { STALE_AFTER_MS, PINNED_CAMERA, POLL_MS } from '../config/dashcam'
import DashcamScreen from '../screens/DashcamScreen'

describe('CGI parsing', () => {
  it('reads the flat key=value form the firmware emits', () => {
    expect(parseCgi('Model=DashCam\nFirmware=1.2.3')).toEqual({
      model: 'DashCam',
      firmware: '1.2.3',
    })
  })

  it('accepts the -key=value and key:value variants, and & separators', () => {
    expect(parseCgi('-cmd=start&-rval=0')).toEqual({ cmd: 'start', rval: '0' })
    expect(parseCgi('SSID: CARDV_1234')).toEqual({ ssid: 'CARDV_1234' })
  })

  // A camera on a weak link truncates replies; a throw here would be shown
  // as "offline" when the camera is merely noisy.
  it('never throws on junk, empty, or non-string bodies', () => {
    expect(parseCgi('')).toEqual({})
    expect(parseCgi(undefined)).toEqual({})
    expect(parseCgi(null)).toEqual({})
    expect(parseCgi('<html>404 not found</html>')).toEqual({})
  })

  it('leaves unknown keys out of the typed readers', () => {
    expect(parseDeviceAttr('Model=X\nUnrelated=9')).toEqual({
      model: 'X',
      firmware: undefined,
      serial: undefined,
      mac: undefined,
    })
  })
})

describe('work state', () => {
  it('reads an explicit recording flag in any of the firmware spellings', () => {
    expect(parseWorkState('recording=1').recording).toBe(true)
    expect(parseWorkState('record=on').recording).toBe(true)
    expect(parseWorkState('isrecording=true').recording).toBe(true)
    expect(parseWorkState('recording=0').recording).toBe(false)
  })

  // Some builds report only a mode string and no flag at all.
  it('infers recording from a mode string when no flag is present', () => {
    expect(parseWorkState('workmode=Recording').recording).toBe(true)
    expect(parseWorkState('workmode=Standby').recording).toBe(false)
  })

  it('reports unknown rather than guessing when the reply says nothing', () => {
    expect(parseWorkState('').recording).toBeUndefined()
  })
})

describe('SD status', () => {
  it('derives used percentage from total and free', () => {
    const sd = parseSdStatus('total=32000\nfree=8000')
    expect(sd.totalMb).toBe(32000)
    expect(sd.freeMb).toBe(8000)
    expect(sd.usedPct).toBe(75)
  })

  it('treats a card that reports a size as present', () => {
    expect(parseSdStatus('total=32000').present).toBe(true)
  })

  it('believes an explicit absent flag', () => {
    expect(parseSdStatus('sdexist=0').present).toBe(false)
  })

  // Dividing by a zero total would yield NaN and render as "NaN%".
  it('omits the percentage when the total is zero or missing', () => {
    expect(parseSdStatus('total=0\nfree=0').usedPct).toBeUndefined()
    expect(parseSdStatus('free=8000').usedPct).toBeUndefined()
  })

  it('clamps nonsense readings into 0-100', () => {
    // free > total happens on cards the firmware mis-reports
    expect(parseSdStatus('total=100\nfree=500').usedPct).toBe(0)
  })

  it('strips units the firmware appends', () => {
    expect(parseSdStatus('total=32000MB\nfree=16000MB').usedPct).toBe(50)
  })
})

describe('wifi', () => {
  it('reads the access point name and channel', () => {
    expect(parseWifi('ssid=CARDV_A1B2\nchannel=6')).toEqual({
      ssid: 'CARDV_A1B2',
      channel: 6,
    })
  })
})

describe('buildStatus', () => {
  it('folds the separate replies into one shape and stamps the time', () => {
    const status = buildStatus({
      deviceAttr: 'model=Pro+\nfirmware=2.0',
      workState: 'recording=1',
      sdStatus: 'total=64000\nfree=32000',
      wifi: 'ssid=CARDV',
    })

    expect(status.online).toBe(true)
    expect(status.recording).toBe(true)
    expect(status.sd.usedPct).toBe(50)
    expect(status.device.model).toBe('Pro+')
    expect(status.wifi.ssid).toBe('CARDV')
    expect(typeof status.at).toBe('number')
  })

  it('still produces a usable status when optional replies are missing', () => {
    const status = buildStatus({ deviceAttr: 'model=Pro+', workState: 'recording=1' })
    expect(status.recording).toBe(true)
    expect(status.sd.present).toBeUndefined()
  })
})

describe('stream URLs', () => {
  it('builds rtsp URLs against the host that answered', () => {
    expect(streamUrls('192.168.169.1')[0]).toBe('rtsp://192.168.169.1/hello.mov')
  })
})

describe('the pinned camera', () => {
  it('matches the fitted recorder by name', () => {
    expect(
      isPinnedCamera({ device: { model: 'MYTVS_FNP8H0XW' } }, PINNED_CAMERA),
    ).toBe(true)
  })

  // The same unit reports its name differently depending on which CGI
  // answered, so case and separators cannot be allowed to matter.
  it('ignores case and separator differences', () => {
    for (const name of ['mytvs_fnp8h0xw', 'MyTVS-FNP8H0XW', 'MYTVS FNP8H0XW', 'MYTVSFNP8H0XW']) {
      expect(normalizeCameraName(name)).toBe('MYTVSFNP8H0XW')
      expect(isPinnedCamera({ device: { model: name } }, PINNED_CAMERA)).toBe(true)
    }
  })

  it('matches on the Wi-Fi name when the identity CGI is silent', () => {
    expect(
      isPinnedCamera({ wifi: { ssid: 'MYTVS_FNP8H0XW' } }, PINNED_CAMERA),
    ).toBe(true)
  })

  it('recognises a different recorder as not ours', () => {
    expect(isPinnedCamera({ device: { model: 'MYTVS_OTHER99' } }, PINNED_CAMERA)).toBe(false)
    expect(isPinnedCamera({ wifi: { ssid: 'CARDV_A1B2' } }, PINNED_CAMERA)).toBe(false)
  })

  // "I cannot tell" is not "no". Older firmware omits the identity CGI, and
  // treating that as an intruder would raise a false alarm on every poll.
  it('makes no claim when nothing identifying was reported', () => {
    expect(isPinnedCamera({ recording: true }, PINNED_CAMERA)).toBeUndefined()
    expect(isPinnedCamera({ device: {}, wifi: {} }, PINNED_CAMERA)).toBeUndefined()
    expect(isPinnedCamera(null, PINNED_CAMERA)).toBeUndefined()
  })

  it('reads the vendor firmware stamp as a date', () => {
    expect(formatFirmware('20250813.155628')).toBe('2025-08-13')
    expect(formatFirmware('20250813')).toBe('2025-08-13')
    expect(formatFirmware(PINNED_CAMERA.firmware)).toBe('2025-08-13')
  })

  it('passes through a version string it does not recognise', () => {
    expect(formatFirmware('1.1.1')).toBe('1.1.1')
    expect(formatFirmware('')).toBeUndefined()
    expect(formatFirmware(null)).toBeUndefined()
  })
})

describe('direct reads', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const reply = (body) => ({ ok: true, status: 200, text: async () => body })

  it('reads from the first host that answers', async () => {
    fetch.mockImplementation(async (url) => {
      if (!url.includes('192.168.1.254')) throw new Error('unreachable')
      return reply('model=Pro+\nrecording=1')
    })

    const status = await readDirect()
    expect(status.host).toBe('192.168.1.254')
    expect(status.source).toBe('direct')
  })

  it('falls through to the second firmware family address', async () => {
    fetch.mockImplementation(async (url) => {
      if (url.includes('192.168.1.254')) throw new Error('unreachable')
      return reply('model=Pro+')
    })

    const status = await readDirect()
    expect(status.host).toBe('192.168.169.1')
  })

  // Older firmware omits whole CGIs; losing the SD reply must not lose the
  // "it is recording" answer alongside it.
  it('tolerates individual CGIs failing', async () => {
    fetch.mockImplementation(async (url) => {
      if (url.includes('getsdstatus')) throw new Error('no such CGI')
      if (url.includes('getdeviceattr')) return reply('model=Pro+')
      return reply('recording=1')
    })

    const status = await readDirect('192.168.1.254')
    expect(status.recording).toBe(true)
    expect(status.sd.present).toBeUndefined()
  })

  it('rejects when no camera is on the network', async () => {
    fetch.mockRejectedValue(new Error('unreachable'))
    await expect(readDirect()).rejects.toThrow()
  })
})

describe('relay reads', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when nothing has ever reported, rather than throwing', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 })
    await expect(readRelay()).resolves.toBeNull()
  })

  it('tags the reading as relayed so the UI can explain itself', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: { online: true, recording: false, at: Date.now() } }),
    })

    const status = await readRelay()
    expect(status.source).toBe('relay')
  })
})

describe('commands', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses an unknown action', async () => {
    await expect(command('erase')).rejects.toThrow(/Unknown camera command/)
  })

  // A browser on HTTPS cannot call the camera's plain-HTTP address at all, so
  // the failure is explained rather than surfaced as a network error.
  it('explains why commands cannot be sent from a secure page', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const original = window.location.protocol
    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol: 'https:' },
      writable: true,
      configurable: true,
    })

    expect(isDirectBlocked()).toBe(true)
    await expect(command('start')).rejects.toThrow(/Wi-Fi/)
    expect(fetch).not.toHaveBeenCalled()

    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol: original },
      writable: true,
      configurable: true,
    })
  })
})

describe('status store', () => {
  beforeEach(() => {
    useDashcamStore.getState().reset()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports offline instead of throwing when every route fails', async () => {
    fetch.mockRejectedValue(new Error('unreachable'))
    await useDashcamStore.getState().refresh()
    expect(useDashcamStore.getState().phase).toBe('offline')
  })

  // The previous reading is the best thing known; dropping it on a failed
  // poll would blank the screen mid-journey.
  it('keeps the last reading on screen when a later poll fails', async () => {
    useDashcamStore.setState({
      phase: 'ready',
      status: { online: true, recording: true, at: Date.now() },
    })

    fetch.mockRejectedValue(new Error('unreachable'))
    await useDashcamStore.getState().refresh({ quiet: true })

    expect(useDashcamStore.getState().status.recording).toBe(true)
    expect(useDashcamStore.getState().phase).toBe('error')
  })

  it('treats a reading past the stale window as not live', () => {
    useDashcamStore.setState({
      phase: 'ready',
      status: { online: true, recording: true, at: Date.now() - STALE_AFTER_MS - 1000 },
    })
    expect(isLive(useDashcamStore.getState())).toBe(false)

    useDashcamStore.setState({
      status: { online: true, recording: true, at: Date.now() },
    })
    expect(isLive(useDashcamStore.getState())).toBe(true)
  })

  // statusAge once took the whole store, which made it return a different
  // number on every render and spun zustand into an endless re-render loop.
  // It must stay a pure function of a timestamp and an explicit clock.
  it('derives age from a timestamp and a caller-supplied clock', () => {
    expect(statusAge(1000, 4000)).toBe(3000)
    expect(statusAge(null)).toBe(Infinity)
    expect(statusAge(undefined)).toBe(Infinity)
    expect(statusAge(5000, 5000)).toBe(0)
  })

  it('is a stable selector — equal states give an identical result', () => {
    const state = { status: { at: Date.now() } }
    expect(isLive(state)).toBe(isLive(state))
  })
})

describe('pairing', () => {
  beforeEach(async () => {
    await unpair()
    useDashcamStore.getState().reset()
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the stored code with every relay read', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: { online: true, at: Date.now() } }),
    })

    await pair('open-sesame')
    fetch.mockClear()
    await readRelay()

    const [, options] = fetch.mock.calls[0]
    expect(options.headers['x-dashcam-pair']).toBe('open-sesame')
  })

  it('refuses to store a code the relay rejects', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 })

    await expect(pair('wrong')).rejects.toThrow(/not accepted/i)
    expect(await getPairCode()).toBe('')
  })

  // A correct code before the first drive gets a 404, because nothing has
  // reported yet. Refusing it would block pairing until the car moved.
  it('accepts a valid code even when no status exists yet', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 })

    await pair('valid-code')
    expect(await getPairCode()).toBe('valid-code')
  })

  it('trims a code pasted with stray whitespace', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    await pair('  spaced  ')
    expect(await getPairCode()).toBe('spaced')
  })

  it('rejects an empty code without troubling the relay', async () => {
    await expect(pair('   ')).rejects.toThrow(/Enter the pairing code/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  // Needing a code is a question to ask, not a camera fault to report.
  it('raises a distinct error so the screen can ask for a code', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 })
    await expect(readRelay()).rejects.toThrow(PairingRequiredError)
  })

  // A stored code that stopped working would otherwise retry forever.
  it('forgets a code the relay has started refusing', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    await pair('once-valid')

    fetch.mockResolvedValue({ ok: false, status: 401 })
    await expect(readRelay()).rejects.toThrow(PairingRequiredError)
    expect(await getPairCode()).toBe('')
  })

  it('moves the store to unpaired and drops the old reading', async () => {
    useDashcamStore.setState({
      phase: 'ready',
      // Belongs to whoever was paired before; it must not linger on screen.
      status: { online: true, recording: true, at: Date.now() },
    })

    fetch.mockResolvedValue({ ok: false, status: 401 })
    await useDashcamStore.getState().refresh()

    expect(useDashcamStore.getState().phase).toBe('unpaired')
    expect(useDashcamStore.getState().status).toBeNull()
  })
})

describe('the Android app shell', () => {
  // The native page is served from https://localhost, which makes every
  // browser-shaped assumption about the origin wrong — and wrong in opposite
  // directions for these two. Both were real bugs.
  const asNative = () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true })
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('names the relay origin, because a relative path resolves to nothing', async () => {
    asNative()
    expect(relayUrl()).toBe('https://ambiance-amber.vercel.app/api/dashcam-status')
  })

  it('keeps the relay same-origin in a browser', () => {
    expect(relayUrl()).toBe('/api/dashcam-status')
  })

  it('calls the absolute relay URL when reading on device', async () => {
    asNative()
    fetch.mockResolvedValue({ ok: false, status: 404 })

    await readRelay()
    expect(fetch.mock.calls[0][0]).toBe('https://ambiance-amber.vercel.app/api/dashcam-status')
  })

  // The WebView is configured to allow cleartext to the camera, so the
  // protocol check that is right in a browser would wrongly hide live view
  // and the record controls on the one device that can use them.
  it('does not treat https as blocking the camera on device', () => {
    asNative()
    expect(isDirectBlocked()).toBe(false)
  })

  it('still treats an https browser page as blocking the camera', () => {
    const original = window.location.protocol
    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol: 'https:' },
      writable: true,
      configurable: true,
    })

    expect(isDirectBlocked()).toBe(true)

    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol: original },
      writable: true,
      configurable: true,
    })
  })

  it('lets the camera be reached directly on device', async () => {
    asNative()
    fetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'model=MYTVS_FNP8H0XW' })

    await expect(command('start')).resolves.toBeUndefined()
    expect(fetch.mock.calls[0][0]).toContain('http://192.168.1.254/')
  })
})

describe('navigation', () => {
  it('exposes the dashcam as its own tab', () => {
    expect(TABS.map((t) => t.id)).toContain('dashcam')
  })
})

describe('the dashcam screen', () => {
  const relayReply = (status) => ({
    ok: true,
    status: 200,
    json: async () => ({ status }),
  })

  beforeEach(async () => {
    await unpair()
    useDashcamStore.getState().reset()
    useUiStore.setState({ tab: 'dashcam' })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(async () => {
    cleanup()
    await unpair()
    useUiStore.setState({ tab: 'home' })
    vi.unstubAllGlobals()
  })

  it('names the product and reports what the camera is doing', async () => {
    fetch.mockResolvedValue(
      relayReply({
        online: true,
        recording: true,
        mode: 'Recording',
        sd: { present: true, totalMb: 61000, freeMb: 12200, usedPct: 80 },
        wifi: { ssid: 'CARDV_FAKE', channel: 6 },
        device: { model: 'TVS Dash Cam', firmware: '1.1.1' },
        at: Date.now(),
      }),
    )

    render(<DashcamScreen />)

    expect(
      await screen.findByRole('heading', { name: /Dash Cam Pro\+/i }),
    ).toBeTruthy()
    // The hero state, specifically — "Recording" is also the mode tile's value.
    expect((await screen.findByRole('status')).textContent).toBe('Recording')
    expect(await screen.findByText('80%')).toBeTruthy()
    expect(await screen.findByText('CARDV_FAKE')).toBeTruthy()
  })

  // Sizes come from the firmware in MB; a person reads gigabytes, and past
  // 10 GB the decimal is noise.
  it('shows free space in units a person would use', async () => {
    fetch.mockResolvedValue(
      relayReply({
        online: true,
        recording: false,
        sd: { present: true, totalMb: 61000, freeMb: 12200, usedPct: 80 },
        at: Date.now(),
      }),
    )

    render(<DashcamScreen />)
    expect(await screen.findByText('12 GB free of 60 GB')).toBeTruthy()
  })

  it('says a card is missing rather than showing a blank figure', async () => {
    fetch.mockResolvedValue(
      relayReply({ online: true, recording: false, sd: { present: false }, at: Date.now() }),
    )

    render(<DashcamScreen />)
    expect(await screen.findByText('No card')).toBeTruthy()
    expect(await screen.findByText(/Insert a card/i)).toBeTruthy()
  })

  // A stale reading must not keep claiming the camera is recording.
  it('marks a stale reading as last seen, not as live', async () => {
    fetch.mockResolvedValue(
      relayReply({
        online: true,
        recording: true,
        at: Date.now() - STALE_AFTER_MS - 5000,
      }),
    )

    render(<DashcamScreen />)
    expect(await screen.findByText('Last seen')).toBeTruthy()
    expect(screen.queryByText('Recording')).toBeNull()
    expect(await screen.findByText(/stopped reporting/i)).toBeTruthy()
  })

  it('reports plainly when no camera has ever been seen', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 })

    render(<DashcamScreen />)
    expect(await screen.findByText('No camera found')).toBeTruthy()
  })

  it('names the pinned camera even before it has reported', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404 })

    render(<DashcamScreen />)
    // The Wi-Fi to join and the firmware on record are true while offline.
    expect(await screen.findByText(/Join this network/i)).toBeTruthy()
    expect(await screen.findByText(/Firmware 2025-08-13/)).toBeTruthy()
    // Named in the subtitle, the Wi-Fi tile and the device tile.
    expect((await screen.findAllByText('MYTVS_FNP8H0XW')).length).toBeGreaterThan(0)
  })

  // A camera's CGI surface has no authentication, so a different recorder on
  // the same subnet answers identically. Saying nothing would mean reading a
  // stranger's footage as your own.
  it('says so when the reading came from a different camera', async () => {
    fetch.mockResolvedValue(
      relayReply({
        online: true,
        recording: true,
        device: { model: 'MYTVS_SOMEONEELSE' },
        at: Date.now(),
      }),
    )

    render(<DashcamScreen />)
    expect(await screen.findByText(/not your camera/i)).toBeTruthy()
  })

  it('stays quiet when the camera reports no name at all', async () => {
    fetch.mockResolvedValue(
      relayReply({ online: true, recording: true, at: Date.now() }),
    )

    render(<DashcamScreen />)
    expect((await screen.findByRole('status')).textContent).toBe('Recording')
    expect(screen.queryByText(/not your camera/i)).toBeNull()
  })

  it('does not poll while another tab is showing', async () => {
    useUiStore.setState({ tab: 'home' })
    fetch.mockResolvedValue(relayReply({ online: true, at: Date.now() }))

    render(<DashcamScreen />)
    await Promise.resolve()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks for a pairing code instead of claiming the camera is missing', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 })

    render(<DashcamScreen />)
    expect(await screen.findByLabelText(/Pairing code/i)).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Pair$/ })).toBeTruthy()
    // The readout must not sit behind the gate implying there is data.
    expect(screen.queryByText('No camera found')).toBeNull()
    expect(screen.queryByText(/free of/)).toBeNull()
  })

  it('explains what the code is for, so it reads as a safeguard', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 })

    render(<DashcamScreen />)
    expect(await screen.findByText(/status is private/i)).toBeTruthy()
  })

  it('shows the readout once a code is accepted', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 })
    render(<DashcamScreen />)

    const field = await screen.findByLabelText(/Pairing code/i)
    fetch.mockResolvedValue(
      relayReply({ online: true, recording: true, at: Date.now() }),
    )

    await act(async () => {
      fireEvent.change(field, { target: { value: 'let-me-in' } })
      fireEvent.click(screen.getByRole('button', { name: /^Pair$/ }))
    })

    expect((await screen.findByRole('status')).textContent).toBe('Recording')
  })

  it('says a code was wrong rather than failing silently', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401 })
    render(<DashcamScreen />)

    const field = await screen.findByLabelText(/Pairing code/i)
    await act(async () => {
      fireEvent.change(field, { target: { value: 'nope' } })
      fireEvent.click(screen.getByRole('button', { name: /^Pair$/ }))
    })

    expect(await screen.findByText(/not accepted/i)).toBeTruthy()
  })

  // Retrying a call that is refused by design would just hammer the relay.
  it('stops polling while this device is unpaired', async () => {
    vi.useFakeTimers()
    try {
      fetch.mockResolvedValue({ ok: false, status: 401 })
      render(<DashcamScreen />)

      await vi.waitFor(() => expect(useDashcamStore.getState().phase).toBe('unpaired'))
      fetch.mockClear()
      await act(async () => {
        vi.advanceTimersByTime(POLL_MS * 4)
      })

      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
