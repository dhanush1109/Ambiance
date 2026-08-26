import { create } from 'zustand'

/**
 * Coordinates the launch overlay with the car's outline tracer.
 *
 * Default `open` so a reduced-motion launch (where the overlay never mounts)
 * still draws the car. The overlay `hold()`s when it will actually play, and
 * `release()`s as the crossfade starts — so the SVG tracer begins while the
 * video's last flare is still on screen.
 */
export const useLaunchStore = create((set) => ({
  gate: 'open',
  hold: () => set({ gate: 'held' }),
  release: () => set({ gate: 'open' }),
}))
