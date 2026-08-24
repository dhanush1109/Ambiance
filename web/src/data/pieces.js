/**
 * Ambiance — top-down cabin map of the Innova Hycross 19-piece LED kit.
 *
 * Plan view, nose at the top. Geometry is hand-authored and mirrored about
 * x = 210 so the car reads as symmetric.
 *
 * The controller exposes only three zones (see ../../HYCROSS_ZONES.md):
 *   Zone 1 "Front cabin"     — 12 pieces: 2 dash strips, 2 vent rings,
 *                              4 door lines, 4 door pockets
 *   Zone 2 "Handles & feet"  —  7 pieces: 4 door handles, 3 footwells
 *   Zone 3 "All"             — every piece together
 *
 * Pieces within a zone ALWAYS share a colour. The map is an honest preview of
 * two linked groups, never a promise of per-piece control.
 */

export const CAR_VIEWBOX = '0 0 420 700'

/** Mirror axis — every right-hand coordinate is 420 minus its left-hand twin. */
export const CAR_AXIS = 210

/**
 * The body silhouette, as one closed bezier path.
 *
 * Exported because four things must trace exactly the same outline: the filled
 * shell, the intro line-draw, the clip for the connect light-sweep, and the
 * MiniCar used on mood cards. Widest at x≈362/58 around y 300–380, which is
 * where an MPV actually carries its width.
 */
export const BODY_D =
  'M210 24 ' +
  'C262 25 306 38 330 72 C344 92 352 122 356 164 ' +
  'C360 208 362 252 362 300 C362 380 361 440 358 500 ' +
  'C356 556 348 610 318 644 C296 666 258 676 210 677 ' +
  'C162 676 124 666 102 644 C72 610 64 556 62 500 ' +
  'C59 440 58 380 58 300 C58 252 60 208 64 164 ' +
  'C68 122 76 92 90 72 C114 38 158 25 210 24 Z'

/** The four doors, as first-class objects. Each owns exactly three pieces. */
export const DOORS = [
  { id: 'fl', label: 'Front left', short: 'FL', row: 'front', side: 'left', labelAt: { x: 40, y: 258 } },
  { id: 'fr', label: 'Front right', short: 'FR', row: 'front', side: 'right', labelAt: { x: 380, y: 258 } },
  { id: 'rl', label: 'Rear left', short: 'RL', row: 'rear', side: 'left', labelAt: { x: 40, y: 400 } },
  { id: 'rr', label: 'Rear right', short: 'RR', row: 'rear', side: 'right', labelAt: { x: 380, y: 400 } },
]

/**
 * @typedef {Object} Piece
 * @property {string} id
 * @property {1|2} zone
 * @property {'dash'|'vent'|'doorline'|'pocket'|'handle'|'footwell'} group
 * @property {string} label            human name, used in aria-labels
 * @property {'strip'|'ring'|'ellipse'} kind
 * @property {'fl'|'fr'|'rl'|'rr'} [door]
 * @property {string} [d]              path data for kind 'strip'
 * @property {number} [w]              stroke width for kind 'strip'
 * @property {number} [cx] @property {number} [cy]
 * @property {number} [r]              radius for kind 'ring'
 * @property {number} [rx] @property {number} [ry]  radii for kind 'ellipse'
 */

/** @type {Piece[]} — exactly 19 entries. */
export const PIECES = [
  // ---- Zone 1 · dashboard (2) -------------------------------------------
  {
    id: 'dash-l',
    zone: 1,
    group: 'dash',
    label: 'Passenger dash strip',
    kind: 'strip',
    d: 'M128 160 L226 160',
    w: 5,
  },
  {
    id: 'dash-r',
    zone: 1,
    group: 'dash',
    label: 'Driver dash strip',
    kind: 'strip',
    d: 'M252 160 L300 160',
    w: 5,
  },

  // ---- Zone 1 · air-vent rings (2) --------------------------------------
  { id: 'vent-l', zone: 1, group: 'vent', label: 'Left vent ring', kind: 'ring', cx: 108, cy: 176, r: 9 },
  { id: 'vent-r', zone: 1, group: 'vent', label: 'Right vent ring', kind: 'ring', cx: 312, cy: 176, r: 9 },

  // ---- Zone 1 · door lines (4) ------------------------------------------
  {
    id: 'line-fl', zone: 1, group: 'doorline', door: 'fl',
    label: 'Front left door line', kind: 'strip', d: 'M72 200 L72 310', w: 5,
  },
  {
    id: 'line-fr', zone: 1, group: 'doorline', door: 'fr',
    label: 'Front right door line', kind: 'strip', d: 'M348 200 L348 310', w: 5,
  },
  {
    id: 'line-rl', zone: 1, group: 'doorline', door: 'rl',
    label: 'Rear left door line', kind: 'strip', d: 'M72 340 L72 452', w: 5,
  },
  {
    id: 'line-rr', zone: 1, group: 'doorline', door: 'rr',
    label: 'Rear right door line', kind: 'strip', d: 'M348 340 L348 452', w: 5,
  },

  // ---- Zone 1 · door storage pockets (4) --------------------------------
  {
    id: 'pocket-fl', zone: 1, group: 'pocket', door: 'fl',
    label: 'Front left door pocket', kind: 'strip', d: 'M92 254 L92 308', w: 4,
  },
  {
    id: 'pocket-fr', zone: 1, group: 'pocket', door: 'fr',
    label: 'Front right door pocket', kind: 'strip', d: 'M328 254 L328 308', w: 4,
  },
  {
    id: 'pocket-rl', zone: 1, group: 'pocket', door: 'rl',
    label: 'Rear left door pocket', kind: 'strip', d: 'M92 396 L92 450', w: 4,
  },
  {
    id: 'pocket-rr', zone: 1, group: 'pocket', door: 'rr',
    label: 'Rear right door pocket', kind: 'strip', d: 'M328 396 L328 450', w: 4,
  },

  // ---- Zone 2 · inner door handles (4) ----------------------------------
  {
    id: 'handle-fl', zone: 2, group: 'handle', door: 'fl',
    label: 'Front left door handle', kind: 'strip', d: 'M86 214 L98 214', w: 6,
  },
  {
    id: 'handle-fr', zone: 2, group: 'handle', door: 'fr',
    label: 'Front right door handle', kind: 'strip', d: 'M322 214 L334 214', w: 6,
  },
  {
    id: 'handle-rl', zone: 2, group: 'handle', door: 'rl',
    label: 'Rear left door handle', kind: 'strip', d: 'M86 354 L98 354', w: 6,
  },
  {
    id: 'handle-rr', zone: 2, group: 'handle', door: 'rr',
    label: 'Rear right door handle', kind: 'strip', d: 'M322 354 L334 354', w: 6,
  },

  // ---- Zone 2 · footwells (3 modules) -----------------------------------
  {
    id: 'foot-fl', zone: 2, group: 'footwell',
    label: 'Front left footwell', kind: 'ellipse', cx: 130, cy: 202, rx: 24, ry: 12,
  },
  {
    id: 'foot-fr', zone: 2, group: 'footwell',
    label: 'Front right footwell', kind: 'ellipse', cx: 290, cy: 202, rx: 24, ry: 12,
  },
  {
    // One physical module lighting both rear floor sides.
    id: 'foot-row2', zone: 2, group: 'footwell',
    label: 'Second row footwell', kind: 'strip', d: 'M122 334 L298 334', w: 9,
  },
]

/** Piece ids grouped by the BLE zone that drives them. */
export const ZONE_PIECES = {
  1: PIECES.filter((p) => p.zone === 1).map((p) => p.id),
  2: PIECES.filter((p) => p.zone === 2).map((p) => p.id),
}

/** Pieces belonging to one door, in draw order. */
export function piecesForDoor(doorId) {
  return PIECES.filter((p) => p.door === doorId)
}

/**
 * Unlit context that makes the drawing read as a car: body, glass, the four
 * door panels with their gaps, seats, console, wheel, screen.
 * Rendered beneath the lit pieces and never coloured by the lights.
 */
export const CABIN_CHROME = [
  // The shell. CarHero paints this with the metallic gradient and rim stroke.
  { id: 'body', type: 'path', role: 'shell', d: BODY_D },

  // Interior floor, inset from the shell so a rim of bodywork shows all round.
  { id: 'cabin', type: 'rect', role: 'cabin', x: 100, y: 158, width: 220, height: 438, rx: 26 },

  // Panel gaps.
  { id: 'bonnet', type: 'path', role: 'line', d: 'M96 118 C160 100 260 100 324 118' },
  { id: 'boot', type: 'path', role: 'line', d: 'M110 598 C180 606 240 606 310 598' },

  // Glass, drawn with their own gradients.
  {
    id: 'windscreen',
    type: 'path',
    role: 'glass',
    d: 'M132 96 C184 86 236 86 288 96 L312 154 C246 144 174 144 108 154 Z',
  },
  {
    id: 'rear-glass',
    type: 'path',
    role: 'glass',
    d: 'M118 606 C180 616 240 616 302 606 L292 650 C238 660 182 660 128 650 Z',
  },

  // The four doors: panels that follow the body's curve, separated by real
  // shut-lines. This is what makes the car read as a car with four doors.
  { id: 'door-fl', type: 'path', role: 'door', d: 'M63 192 C62 234 61 276 61 318 L102 318 L102 192 Z' },
  { id: 'door-rl', type: 'path', role: 'door', d: 'M61 326 C60 370 60 416 61 460 L102 460 L102 326 Z' },
  { id: 'door-fr', type: 'path', role: 'door', d: 'M357 192 C358 234 359 276 359 318 L318 318 L318 192 Z' },
  { id: 'door-rr', type: 'path', role: 'door', d: 'M359 326 C360 370 360 416 359 460 L318 460 L318 326 Z' },

  // Shut-lines between and around the door panels.
  { id: 'shut-fl', type: 'path', role: 'line', d: 'M61 190 L102 190' },
  { id: 'shut-rl', type: 'path', role: 'line', d: 'M61 462 L102 462' },
  { id: 'shut-fr', type: 'path', role: 'line', d: 'M359 190 L318 190' },
  { id: 'shut-rr', type: 'path', role: 'line', d: 'M359 462 L318 462' },

  // Front buckets, with a stitching inset and headrests.
  { id: 'seat-fl', type: 'rect', role: 'trim', x: 106, y: 214, width: 58, height: 78, rx: 16 },
  { id: 'seat-fl-stitch', type: 'rect', role: 'stitch', x: 111, y: 219, width: 48, height: 68, rx: 12 },
  { id: 'head-fl', type: 'rect', role: 'trim', x: 118, y: 206, width: 34, height: 10, rx: 5 },
  { id: 'seat-fr', type: 'rect', role: 'trim', x: 256, y: 214, width: 58, height: 78, rx: 16 },
  { id: 'seat-fr-stitch', type: 'rect', role: 'stitch', x: 261, y: 219, width: 48, height: 68, rx: 12 },
  { id: 'head-fr', type: 'rect', role: 'trim', x: 268, y: 206, width: 34, height: 10, rx: 5 },

  // Second and third rows.
  { id: 'bench-2', type: 'rect', role: 'trim', x: 104, y: 350, width: 212, height: 72, rx: 14 },
  { id: 'bench-2-stitch', type: 'rect', role: 'stitch', x: 109, y: 355, width: 202, height: 62, rx: 10 },
  { id: 'bench-2-split', type: 'path', role: 'stitch', d: 'M175 352 L175 420' },
  { id: 'bench-3', type: 'rect', role: 'trim', x: 108, y: 490, width: 204, height: 66, rx: 14 },
  { id: 'bench-3-stitch', type: 'rect', role: 'stitch', x: 113, y: 495, width: 194, height: 56, rx: 10 },

  // Centre console and gear selector.
  { id: 'console', type: 'rect', role: 'trim', x: 184, y: 220, width: 52, height: 110, rx: 14 },
  { id: 'gear', type: 'ellipse', role: 'stitch', cx: 210, cy: 300, rx: 8, ry: 8 },

  // Right-hand drive: wheel rim, hub, and the centre screen.
  { id: 'wheel', type: 'ellipse', role: 'wheel', cx: 288, cy: 182, rx: 22, ry: 14 },
  { id: 'wheel-hub', type: 'ellipse', role: 'stitch', cx: 288, cy: 182, rx: 8, ry: 5 },
  { id: 'screen', type: 'rect', role: 'screen', x: 192, y: 160, width: 36, height: 20, rx: 4 },
]

/** Copy shown under the map. Deliberately honest about the hardware. */
export const ZONE_CAPTION = {
  1: 'Front cabin · 12 pieces — dash, vents, all four door lines and pockets',
  2: 'Handles & feet · 7 pieces — all four handles and the footwells',
  3: 'All cabin · 19 pieces together',
}
