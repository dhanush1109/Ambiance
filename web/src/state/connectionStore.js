import { create } from 'zustand'

/**
 * Link to the pinned controller. Deliberately not persisted — connection state
 * must always be discovered fresh at launch, never assumed from last run.
 */
export const useConnectionStore = create((set) => ({
  /** idle | scanning | connecting | connected | reconnecting | error */
  status: 'idle',
  device: null,
  devices: [],
  error: null,
  attempt: 0,

  setStatus: (status) => set({ status, ...(status === 'connected' ? { error: null, attempt: 0 } : null) }),
  setDevice: (device) => set({ device }),
  setDevices: (devices) => set({ devices: Array.isArray(devices) ? devices : [] }),
  setError: (error) => set({ error: error ? String(error.message ?? error) : null }),
  setAttempt: (attempt) => set({ attempt }),
  reset: () => set({ status: 'idle', device: null, devices: [], error: null, attempt: 0 }),
}))

export const isConnected = (s) => s.status === 'connected'
export const isBusy = (s) => s.status === 'scanning' || s.status === 'connecting'
