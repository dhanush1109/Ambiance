import { useEffect, useRef } from 'react'
import NavBar from './components/NavBar'
import StatusPill from './components/StatusPill'
import Toast from './components/Toast'
import AmbientBackdrop from './components/AmbientBackdrop'
import LaunchOverlay from './components/LaunchOverlay'
import HomeScreen from './screens/HomeScreen'
import MoodsScreen from './screens/MoodsScreen'
import EffectsScreen from './screens/EffectsScreen'
import FavoritesScreen from './screens/FavoritesScreen'
import DashcamScreen from './screens/DashcamScreen'
import SettingsScreen from './screens/SettingsScreen'
import { useUiStore } from './state/uiStore'
import { useLightStore, dominantHex } from './state/lightStore'
import { useSettingsStore } from './state/settingsStore'
import { useConnectionStore } from './state/connectionStore'
import { useBreakpoint } from './hooks/useBreakpoint'
import { controller } from './services/controller'
import { startAutoReconnect } from './services/reconnect'
import { initBackButton } from './services/backButton'
import { initKeepAwake, initStatusBar } from './services/nativeShell'
import { ambient } from './engine/ambientEngine'
import { initTimeOfDayScheduler } from './engine/timeOfDayScheduler'
import { hexToRgb } from './protocol/hex'
import './App.css'

const SCREENS = {
  home: HomeScreen,
  moods: MoodsScreen,
  effects: EffectsScreen,
  favorites: FavoritesScreen,
  dashcam: DashcamScreen,
  settings: SettingsScreen,
}

export default function App() {
  const tab = useUiStore((s) => s.tab)
  const breakpoint = useBreakpoint()
  const light = useLightStore(dominantHex)
  const reduceGlass = useSettingsStore((s) => s.reduceGlass)
  const reduceMotion = useSettingsStore((s) => s.reduceMotion)
  const booted = useRef(false)

  // --accent is the app's fixed premium colour and never changes. --light is
  // the live cabin colour — it drives the car, its previews, and the ambient
  // backdrop, and nothing else. Splitting these is what stops the whole
  // interface turning orange whenever the cabin is set to orange.
  useEffect(() => {
    const { r, g, b } = hexToRgb(light)
    const root = document.documentElement
    root.style.setProperty('--light', light)
    root.style.setProperty('--light-soft', `rgba(${r}, ${g}, ${b}, 0.18)`)
    root.style.setProperty('--light-glow', `rgba(${r}, ${g}, ${b}, 0.55)`)
  }, [light])

  useEffect(() => {
    document.body.dataset.reduceGlass = reduceGlass ? '1' : '0'
  }, [reduceGlass])

  useEffect(() => {
    const flag = reduceMotion ? '1' : '0'
    document.body.dataset.reduceMotion = flag
    // Also on <html>: the accent transition lives on :root, which a
    // body[data-*] selector cannot reach.
    document.documentElement.dataset.reduceMotion = flag
  }, [reduceMotion])

  // StrictMode double-invokes effects in dev; this must only ever run once
  useEffect(() => {
    if (booted.current) return undefined
    booted.current = true

    controller.init()
    startAutoReconnect()
    initKeepAwake()
    initStatusBar()
    initTimeOfDayScheduler()

    // On a fresh connection: restore the last look, and fade it up unless the
    // link only blipped for a moment.
    //
    // Deliberately not returned as cleanup: this lives for the life of the app,
    // and the `booted` guard means a StrictMode remount would tear it down and
    // then skip re-creating it, leaving the app permanently unable to restore
    // state on connect.
    useConnectionStore.subscribe((s, prev) => {
      if (s.status !== 'connected' || prev.status === 'connected') return
      const settings = useSettingsStore.getState()

      controller.lastDropAge().then((age) => {
        const briefBlip = age < 60_000
        if (settings.welcomeAnimation && !briefBlip) {
          ambient.start('welcome')
        } else if (settings.restoreLastState) {
          controller.restoreLastState()
        }
        if (settings.timeOfDayTheme) ambient.start('timeOfDay')
      })
    })

    return undefined
  }, [])

  // Its own effect with real cleanup, so StrictMode's mount/unmount/mount
  // leaves exactly one listener registered.
  useEffect(() => initBackButton(), [])

  const rail = breakpoint === 'tablet'

  return (
    <div className={`app${rail ? ' app-rail' : ''}`}>
      <AmbientBackdrop />
      <main className="app-main">
        {Object.entries(SCREENS).map(([id, Screen]) => (
          // Kept mounted so the cabin map never re-mounts on a tab change
          <div key={id} className="app-screen" hidden={tab !== id}>
            <Screen />
          </div>
        ))}
      </main>

      <div className="app-link">
        <StatusPill micro />
      </div>
      <NavBar variant={rail ? 'rail' : 'bottom'} />
      <Toast />
      {/* Last child, so it layers over everything without needing the rest of
          the app to know it exists. Decorative and self-unmounting. */}
      <LaunchOverlay />
    </div>
  )
}
