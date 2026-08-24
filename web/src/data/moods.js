/**
 * Moods — the curated dual-zone scenes that make up the emotional core of Lumen.
 *
 * HARDWARE TRUTH: the ATW-FWD-AAA6 exposes three zones and nothing finer.
 *   z1 = Front cabin  (12 pieces: dash bars, vent rings, door lines, pockets)
 *   z2 = Handles & feet (7 pieces: four door handles, three footwells)
 * A mood is therefore exactly two colours and two brightness levels — no
 * per-piece anything. Everything below is designed inside that constraint.
 *
 * COMPOSITION RULES used throughout:
 *   - z1 carries the identity colour; z2 is the shadow that grounds it.
 *   - z2 is normally 1–3 brightness steps below z1, so the cabin reads as lit
 *     from the waistline down rather than glowing uniformly like a fish tank.
 *   - Pairs are either harmonic (a deeper, more saturated relative of the front
 *     hue) or a deliberate complementary contrast — never accidental.
 *   - Colours stay saturated even for "dim" moods; the controller's 0–9
 *     brightness does the dimming, so a near-black hex would just vanish.
 *
 * Brightness is 0–9 (firmware range). Names are original to Lumen.
 *
 * @typedef {{hex: string, brightness: number}} ZoneSetting
 * @typedef {{id: string, name: string, subtitle: string,
 *            z1: ZoneSetting, z2: ZoneSetting, tags: string[]}} Mood
 */

/** @type {Mood[]} */
export const MOODS = [
  {
    id: 'ember-drift',
    name: 'Ember Drift',
    subtitle: 'Warm amber across the dash, a low ember pooling at your feet.',
    z1: { hex: '#ff8a3d', brightness: 7 },
    z2: { hex: '#c22f06', brightness: 4 },
    tags: ['warm', 'signature'],
  },
  {
    id: 'copper-lounge',
    name: 'Copper Lounge',
    subtitle: 'Late-evening gold over a burnt bronze floor.',
    z1: { hex: '#ffb64a', brightness: 5 },
    z2: { hex: '#a8480a', brightness: 3 },
    tags: ['warm', 'calm'],
  },
  {
    id: 'nocturne-gold',
    name: 'Nocturne Gold',
    subtitle: 'Champagne on the dash, the hush of a closed lounge below.',
    z1: { hex: '#d8b34a', brightness: 4 },
    z2: { hex: '#7a4a0f', brightness: 2 },
    tags: ['warm', 'subtle', 'night'],
  },
  {
    id: 'kinetic-red',
    name: 'Kinetic Red',
    subtitle: 'Sport mode for the cabin — hot front, molten handles.',
    z1: { hex: '#ff2436', brightness: 8 },
    z2: { hex: '#ff5a0a', brightness: 5 },
    tags: ['warm', 'vivid'],
  },
  {
    id: 'blush-drive',
    name: 'Blush Drive',
    subtitle: 'Soft rose light with a plum shadow under the doors.',
    z1: { hex: '#ff6fa5', brightness: 6 },
    z2: { hex: '#7a1250', brightness: 3 },
    tags: ['warm', 'vivid'],
  },
  {
    id: 'velvet-hour',
    name: 'Velvet Hour',
    subtitle: 'Deep violet up front, indigo settling into the footwells.',
    z1: { hex: '#a341ff', brightness: 6 },
    z2: { hex: '#2b1e9c', brightness: 3 },
    tags: ['vivid', 'cool', 'night'],
  },
  {
    id: 'aurora-split',
    name: 'Aurora Split',
    subtitle: 'Mint above, electric violet below — a deliberate collision.',
    z1: { hex: '#4ff0c0', brightness: 6 },
    z2: { hex: '#7a2bff', brightness: 4 },
    tags: ['vivid', 'cool', 'contrast'],
  },
  {
    id: 'cobalt-cruise',
    name: 'Cobalt Cruise',
    subtitle: 'Saturated cobalt, built for the long highway hours.',
    z1: { hex: '#2e6bff', brightness: 6 },
    z2: { hex: '#0b2b8a', brightness: 3 },
    tags: ['cool', 'vivid'],
  },
  {
    id: 'arctic-rail',
    name: 'Arctic Rail',
    subtitle: 'Ice-white dash lines running over a steel-blue floor.',
    z1: { hex: '#9fe4ff', brightness: 6 },
    z2: { hex: '#0e5a9c', brightness: 3 },
    tags: ['cool', 'subtle'],
  },
  {
    id: 'teal-tide',
    name: 'Teal Tide',
    subtitle: 'Cool teal that keeps the cabin awake without shouting.',
    z1: { hex: '#16d9c4', brightness: 6 },
    z2: { hex: '#06537a', brightness: 3 },
    tags: ['cool', 'calm'],
  },
  {
    id: 'verdant-calm',
    name: 'Verdant Calm',
    subtitle: 'A quiet mint front with deep forest under the seats.',
    z1: { hex: '#63e6a4', brightness: 5 },
    z2: { hex: '#0d7a4f', brightness: 2 },
    tags: ['cool', 'subtle', 'calm'],
  },
  {
    id: 'ash-rose',
    name: 'Ash Rose',
    subtitle: 'Muted warm neutral — barely a colour, entirely a mood.',
    z1: { hex: '#e8b9a6', brightness: 4 },
    z2: { hex: '#8c5568', brightness: 2 },
    tags: ['neutral', 'subtle'],
  },
  {
    id: 'clear-cabin',
    name: 'Clear Cabin',
    subtitle: 'Neutral white, lifted high — for finding what rolled under the seat.',
    z1: { hex: '#fff4e6', brightness: 9 },
    z2: { hex: '#ffe9cc', brightness: 8 },
    tags: ['neutral', 'bright', 'utility'],
  },
  {
    id: 'midnight-ink',
    name: 'Midnight Ink',
    subtitle: 'Almost nothing. Just enough to find the shifter at 3am.',
    z1: { hex: '#1e40a8', brightness: 2 },
    z2: { hex: '#2a1466', brightness: 1 },
    tags: ['cool', 'night', 'dim'],
  },
];
