import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { storage } from '../services/storage'
import { useLightStore } from './lightStore'

let seq = 0
const newId = () => `fav-${Date.now().toString(36)}-${(seq++).toString(36)}`

/** Looks the driver saved. Captures both zones plus any running animation. */
export const useFavoritesStore = create()(
  persist(
    (set, get) => ({
      items: [],

      /** Snapshot whatever the lights are doing right now. */
      add: (name) => {
        const l = useLightStore.getState()
        const item = {
          id: newId(),
          name: (name || '').trim() || defaultName(get().items.length),
          z1: { ...l.zones[1] },
          z2: { ...l.zones[2] },
          mode: l.activeMode ? { ...l.activeMode } : null,
          createdAt: Date.now(),
        }
        set({ items: [...get().items, item] })
        return item
      },

      remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),

      rename: (id, name) =>
        set({
          items: get().items.map((i) =>
            i.id === id ? { ...i, name: (name || '').trim() || i.name } : i,
          ),
        }),

      reorder: (from, to) => {
        const items = [...get().items]
        if (from < 0 || from >= items.length || to < 0 || to >= items.length) return
        const [moved] = items.splice(from, 1)
        items.splice(to, 0, moved)
        set({ items })
      },

      move: (id, delta) => {
        const items = get().items
        const from = items.findIndex((i) => i.id === id)
        if (from < 0) return
        get().reorder(from, Math.max(0, Math.min(items.length - 1, from + delta)))
      },
    }),
    {
      name: 'ambiance.favorites',
      version: 1,
      storage: createJSONStorage(() => storage),
      onRehydrateStorage: () => (_s, error) => {
        if (error) console.warn('[ambiance] favourites did not restore:', error)
      },
    },
  ),
)

function defaultName(n) {
  return `Look ${n + 1}`
}
