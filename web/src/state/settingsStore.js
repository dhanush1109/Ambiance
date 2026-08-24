import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { storage } from '../services/storage'

/** User preferences. All persisted, all safe to lose. */
export const useSettingsStore = create()(
  persist(
    (set) => ({
      autoReconnect: true,
      restoreLastState: true,
      welcomeAnimation: true,
      timeOfDayTheme: false,
      keepAwake: false,
      haptics: true,
      reduceGlass: false,
      reduceMotion: false,

      set: (key, value) => set({ [key]: value }),
      toggle: (key) => set((s) => ({ [key]: !s[key] })),
    }),
    {
      name: 'ambiance.settings',
      version: 1,
      storage: createJSONStorage(() => storage),
      onRehydrateStorage: () => (_s, error) => {
        if (error) console.warn('[ambiance] settings did not restore:', error)
      },
    },
  ),
)

/** Labels and descriptions, so Settings never shows a bare switch. */
export const SETTING_META = [
  {
    key: 'autoReconnect',
    label: 'Reconnect automatically',
    hint: 'Connect to your controller as soon as the app opens, and again if the link drops.',
  },
  {
    key: 'restoreLastState',
    label: 'Restore last look',
    hint: 'Bring back the colour and brightness you were using when you last drove.',
  },
  {
    key: 'welcomeAnimation',
    label: 'Welcome fade',
    hint: 'Fade the cabin up from a warm glow when the app connects.',
  },
  {
    key: 'timeOfDayTheme',
    label: 'Match the time of day',
    hint: 'Cooler light by day, warmer after dark. Set when you connect and kept in step while the app is open, until you change a colour yourself.',
  },
  {
    key: 'keepAwake',
    label: 'Keep the screen on',
    hint: 'Stop the device sleeping while Ambiance is open. Useful on a dash mount.',
  },
  {
    key: 'haptics',
    label: 'Haptic feedback',
    hint: 'A small tap from the phone when you change something. Needs a vibration motor.',
  },
  {
    key: 'reduceGlass',
    label: 'Reduce blur',
    hint: 'Swap the frosted panels for solid ones. Smoother on older tablets.',
  },
  {
    key: 'reduceMotion',
    label: 'Reduce motion',
    hint: 'Turn off transitions and looping animations throughout the app.',
  },
]
