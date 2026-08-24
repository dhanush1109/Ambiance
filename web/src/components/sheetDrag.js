/**
 * Physics for dragging a bottom sheet away.
 *
 * Pure functions, no DOM — partly so the behaviour can be tested without
 * faking layout, and partly because the interesting decisions here are
 * arithmetic, not rendering.
 *
 * The rules come from Apple's "Designing Fluid Interfaces":
 *   - decide from where the sheet *would end up*, not where the finger let go
 *   - resist rather than stop dead at a boundary
 *   - don't commit to a gesture direction until the user has clearly shown one
 */

/** Matches UIScrollView's normal deceleration. */
export const DECEL = 0.998

/** Travel before a drag commits — below this it could still be a tap or a scroll. */
export const HYSTERESIS_PX = 10

/** How far the sheet can be pulled up past its resting place. */
export const RUBBER_LIMIT_PX = 32

/** Dismiss once the projected endpoint passes this much of the sheet. */
export const DISMISS_FRACTION = 0.5

/**
 * Ceiling on release velocity, px/ms. A genuinely fast human flick is around
 * 2–3; this sits above that. Two pointer events landing a fraction of a
 * millisecond apart would otherwise divide by a near-zero interval and project
 * the sheet into the next county.
 */
export const MAX_VELOCITY = 4

/**
 * Where the sheet would come to rest if released right now.
 *
 * @param {number} offset   current translateY, px (positive = dragged down)
 * @param {number} velocity px per ms (positive = moving down)
 */
export function projectEndpoint(offset, velocity, decel = DECEL) {
  return offset + (velocity * decel) / (1 - decel)
}

/**
 * Dismiss or spring back.
 *
 * Judging the projection rather than the raw offset is what makes a flick
 * feel right: a sheet dragged most of the way down but flicked *upward* at
 * release is travelling home, and should go home.
 *
 * @returns {'dismiss'|'settle'}
 */
export function sheetDragOutcome({ offset, velocity, sheetHeight }) {
  // A zero height (jsdom, or a sheet measured before layout) must not make
  // every gesture look like a dismissal.
  const height = Math.max(1, sheetHeight || 0)
  const projected = projectEndpoint(offset, velocity)
  return projected >= height * DISMISS_FRACTION ? 'dismiss' : 'settle'
}

/**
 * Diminishing travel past a boundary: the further you pull, the less it gives,
 * approaching `limit` but never reaching it.
 *
 * @param {number} pull how far past the boundary the finger has moved, px
 */
export function rubberBand(pull, limit = RUBBER_LIMIT_PX, c = 0.55) {
  if (pull <= 0) return 0
  return (1 - 1 / ((pull * c) / limit + 1)) * limit
}

/**
 * Should this pointer movement become a sheet drag?
 *
 * Requires the gesture to have started on the handle or header, to have
 * travelled far enough to be deliberate, and to be more vertical than
 * horizontal.
 */
export function armDrag({ inHandle, dx, dy }) {
  if (!inHandle) return false
  if (Math.abs(dy) < HYSTERESIS_PX) return false
  return Math.abs(dy) > Math.abs(dx)
}

/**
 * Release velocity in px/ms, from the tail of the pointer trail.
 *
 * Only the most recent `windowMs` counts — a slow drag that ends in a flick
 * should read as a flick, not as the average of the whole journey.
 *
 * @param {Array<{t: number, y: number}>} samples oldest first
 */
export function velocityFrom(samples, windowMs = 100) {
  if (!Array.isArray(samples) || samples.length < 2) return 0

  const last = samples[samples.length - 1]
  let first = samples[0]
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (last.t - samples[i].t <= windowMs) first = samples[i]
    else break
  }

  const dt = last.t - first.t
  if (dt <= 0) return 0

  const v = (last.y - first.y) / dt
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v))
}

/**
 * How long the exit should take, matched to how fast the sheet is already
 * moving — a hard flick shouldn't then crawl off screen.
 */
export function exitDuration(offset, velocity, sheetHeight) {
  const remaining = Math.max(0, (sheetHeight || 0) - offset)
  const speed = Math.max(velocity, 0.7)
  return Math.min(320, Math.max(160, remaining / speed))
}
