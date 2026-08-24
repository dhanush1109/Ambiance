import { useEffect, useRef, useState } from 'react'
import ColorButton from './ColorButton'
import ColorSheet from './ColorSheet'
import Brightness from './Brightness'
import PowerButton from './PowerButton'
import { useLightStore } from '../state/lightStore'
import { useConnectionStore, isConnected } from '../state/connectionStore'
import { useUiStore } from '../state/uiStore'
import { controller } from '../services/controller'
import { haptics } from '../services/haptics'
import './ControlDock.css'

/**
 * The floating control panel — one of the app's three glass surfaces.
 * Everything here edits whichever zone is currently selected. The colour
 * picker lives behind its own button rather than inline, so it only takes
 * over the screen when you actually want it — and the cabin map gets the
 * room the dock used to take.
 */
export default function ControlDock({ variant = 'floating' }) {
  const zones = useLightStore((s) => s.zones)
  const selectedZone = useLightStore((s) => s.selectedZone)
  const power = useLightStore((s) => s.power)
  const connected = useConnectionStore(isConnected)
  const tab = useUiStore((s) => s.tab)
  const [colorOpen, setColorOpen] = useState(false)

  const zone = zones[selectedZone] ?? zones[3]

  const openColor = () => {
    haptics.tap()
    setColorOpen(true)
  }

  // Reaching for anything else — a different zone, another tab — puts the
  // picker away rather than leaving it stranded open behind whatever you
  // actually wanted to do next.
  const skipZoneClose = useRef(true)
  useEffect(() => {
    if (skipZoneClose.current) {
      skipZoneClose.current = false
      return
    }
    setColorOpen(false)
  }, [selectedZone])

  useEffect(() => {
    if (tab !== 'home') setColorOpen(false)
  }, [tab])

  return (
    <div className={`dock ${variant === 'floating' ? 'glass-dock dock-floating' : 'dock-panel'}`}>
      <div className="dock-row">
        <ColorButton
          hex={zone.hex}
          disabled={!connected}
          open={colorOpen}
          onPress={openColor}
        />
        <Brightness
          value={zone.brightness}
          disabled={!connected}
          onChange={(l) => useLightStore.getState().setZoneBrightness(selectedZone, l)}
          onCommit={(l) => controller.setBrightness(selectedZone, l)}
        />
        <PowerButton
          on={power}
          disabled={!connected}
          onToggle={(next) => {
            haptics.tap()
            controller.setPower(next)
          }}
        />
      </div>

      <ColorSheet open={colorOpen} onClose={() => setColorOpen(false)} />
    </div>
  )
}
