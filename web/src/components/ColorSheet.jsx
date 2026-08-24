import { useCallback, useRef } from 'react'
import Sheet from './Sheet'
import ColorField from './ColorField'
import { useLightStore } from '../state/lightStore'
import { controller } from '../services/controller'
import { ZONES } from '../protocol/catalog'
import './ColorSheet.css'

/** Colour changes stream while dragging; this keeps the radio from flooding. */
const SEND_MS = 100

/**
 * The colour picker, behind its own sheet rather than living permanently on
 * Home — it is the single largest control, and hiding it behind a tap gives
 * the cabin map the room it was actually designed for.
 */
export default function ColorSheet({ open, onClose }) {
  const zones = useLightStore((s) => s.zones)
  const selectedZone = useLightStore((s) => s.selectedZone)
  const setZoneColor = useLightStore((s) => s.setZoneColor)

  const zone = zones[selectedZone] ?? zones[3]
  const zoneName = ZONES.find((z) => z.id === selectedZone)?.name ?? 'All cabin'

  const lastSent = useRef(0)
  const trailing = useRef(null)

  const onColorChange = useCallback(
    (hex) => {
      // Update the map instantly so the car tracks the thumb
      setZoneColor(selectedZone, hex)

      const now = Date.now()
      if (now - lastSent.current >= SEND_MS) {
        lastSent.current = now
        controller.setColor(selectedZone, hex)
      } else {
        // Guarantee the last value lands even if the drag stops between ticks
        clearTimeout(trailing.current)
        trailing.current = setTimeout(() => {
          lastSent.current = Date.now()
          controller.setColor(selectedZone, hex)
        }, SEND_MS)
      }
    },
    [selectedZone, setZoneColor],
  )

  const onColorCommit = useCallback(
    (hex) => {
      clearTimeout(trailing.current)
      lastSent.current = Date.now()
      controller.setColor(selectedZone, hex)
    },
    [selectedZone],
  )

  return (
    <Sheet open={open} title="Colour" onClose={onClose} anchor>
      <p className="colorsheet-zone">{zoneName}</p>
      <ColorField hex={zone.hex} onChange={onColorChange} onCommit={onColorCommit} />
    </Sheet>
  )
}
