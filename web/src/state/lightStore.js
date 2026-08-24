import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { storage } from '../services/storage'

/**
 * What the lights are currently doing.
 *
 * The firmware gives no read-back, so this store is strictly "last commanded".
 * Zone 3 is not a separate strip — it is the whole kit — so writing zone 3 also
 * writes zones 1 and 2, mirroring what the hardware physically does. Without
 * that mirroring the cabin map would drift out of sync with the car.
 */

const DEFAULT_HEX = '#ff8a3d'

const zone = (hex = DEFAULT_HEX, brightness = 5) => ({ hex, brightness })

export const useLightStore = create()(
  persist(
    (set, get) => ({
      power: false,
      selectedZone: 3,
      zones: { 1: zone(), 2: zone(), 3: zone() },
      activeMode: null,
      activeMoodId: null,
      driftOn: false,
      speed: 3,
      lastManualAt: 0,

      setPower: (on) => set({ power: !!on }),

      selectZone: (id) => {
        const z = Number(id)
        if (z === 1 || z === 2 || z === 3) set({ selectedZone: z })
      },

      /** Choosing a colour exits any running firmware animation. */
      setZoneColor: (id, hex) => {
        const z = Number(id)
        const zones = { ...get().zones }
        if (z === 3) {
          zones[3] = { ...zones[3], hex }
          zones[1] = { ...zones[1], hex }
          zones[2] = { ...zones[2], hex }
        } else {
          zones[z] = { ...zones[z], hex }
        }
        set({ zones, activeMode: null })
      },

      setZoneBrightness: (id, level) => {
        const z = Number(id)
        const b = Math.max(0, Math.min(9, Math.round(Number(level) || 0)))
        const zones = { ...get().zones }
        if (z === 3) {
          zones[3] = { ...zones[3], brightness: b }
          zones[1] = { ...zones[1], brightness: b }
          zones[2] = { ...zones[2], brightness: b }
        } else {
          zones[z] = { ...zones[z], brightness: b }
        }
        set({ zones })
      },

      setActiveMode: (mode) => set({ activeMode: mode, activeMoodId: null }),
      clearMode: () => set({ activeMode: null }),
      setSpeed: (level) =>
        set({ speed: Math.max(1, Math.min(6, Math.round(Number(level) || 1))) }),
      setMood: (id) => set({ activeMoodId: id }),
      setDrift: (on) => set({ driftOn: !!on }),

      /** Any human action. The ambient engine watches this and stands down. */
      markManual: () => set({ lastManualAt: Date.now() }),

      /** Apply both zones at once without three separate renders. */
      applyPair: (z1, z2, moodId = null) =>
        set((s) => ({
          zones: {
            1: { ...s.zones[1], ...z1 },
            2: { ...s.zones[2], ...z2 },
            3: { ...s.zones[3], hex: z1.hex ?? s.zones[3].hex },
          },
          activeMode: null,
          activeMoodId: moodId,
        })),
    }),
    {
      name: 'ambiance.light',
      version: 3,
      migrate: (persisted) => {
        const s = Number(persisted?.speed)
        return {
          ...persisted,
          speed: Math.max(1, Math.min(6, Number.isFinite(s) && s >= 1 ? Math.min(s, 6) : 3)),
        }
      },
      storage: createJSONStorage(() => storage),
      // Never persist transient state — a stale activeMode would lie about the car
      partialize: (s) => ({
        power: s.power,
        zones: s.zones,
        selectedZone: s.selectedZone,
        speed: s.speed,
      }),
      onRehydrateStorage: () => (_state, error) => {
        // A corrupt store must never white-screen the app
        if (error) console.warn('[ambiance] light state did not restore:', error)
      },
    },
  ),
)

/** Colour of whichever zone is currently selected. */
export function dominantHex(state) {
  return state?.zones?.[state.selectedZone]?.hex ?? DEFAULT_HEX
}

/** Brightness of whichever zone is currently selected. */
export function dominantBrightness(state) {
  return state?.zones?.[state.selectedZone]?.brightness ?? 5
}
