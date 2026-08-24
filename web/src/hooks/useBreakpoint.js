import { useSyncExternalStore } from 'react'

/**
 * 'phone' | 'tablet' at 900px.
 *
 * useSyncExternalStore gives the correct value on the very first render, so the
 * 11.5" tablet never flashes the phone layout before switching.
 */

const QUERY = '(min-width: 900px)'

const mql = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null

function subscribe(onChange) {
  const m = mql()
  if (!m) return () => {}
  if (typeof m.addEventListener === 'function') {
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }
  // Safari < 14 and older WebViews
  m.addListener(onChange)
  return () => m.removeListener(onChange)
}

const getSnapshot = () => (mql()?.matches ? 'tablet' : 'phone')
const getServerSnapshot = () => 'phone'

export function useBreakpoint() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export const useIsTablet = () => useBreakpoint() === 'tablet'
