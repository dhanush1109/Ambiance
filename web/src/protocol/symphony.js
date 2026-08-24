/**
 * Official Cardi Magic Symphony page: Magic Dazzle / Music Rhythm / Magic Shadow.
 *
 * Ported LINE-FOR-LINE from `../symphony_modes.py`. Type A frames come from
 * huancaiFragment.playmode1().
 *
 * QUIRK (intentional): `_a()` builds a HEX STRING and appends `extra` as
 * DECIMAL digits which are then read as hex digits. Across every branch below
 * `extra` always lands in 31..37, i.e. the ASCII bytes '1'..'7'. Keep every
 * threshold and offset verbatim.
 *
 * These animations are GLOBAL - the controller has no per-zone animation.
 */

import { hexToBytes } from './hex.js';

export const DAZZLE_NAMES = [
  'Color Flow', 'RGB Color Flow', 'Cyan-Yellow-Purple Flow', 'Red-Blue Flow',
  'Orange-Purple Flow', 'Yellow-Blue Flow', 'Cyan-Purple Flow', 'Color Trail',
  'Red-Blue Trail', 'Red Trail', 'Purple Trail', 'Blue Trail', 'Yellow Trail',
  'Cyan Trail', 'Colorful Curtain', 'Cyan Yellow Purple Curtain', 'Red Green Blue Curtain',
  'Orange Blue Purple Curtain', 'Red Blue Curtain', 'Red Green Curtain', 'Green Purple Curtain',
  'Colorful Curtain 2', 'Cyan Yellow Purple Chasing', 'Red Blue Orange Chasing', 'Red Blue Chasing',
  'Red Green Chasing', 'Red Pink Chasing', 'Cyan Blue Chasing', 'Colorful Closing',
  'Cyan Yellow Purple Closing', 'Red Green Blue Closing', 'Orange Blue Purple Closing',
  'Red Blue Closing', 'Red Green Closing', 'Green Purple Closing', 'Colorful Welcome',
  'Cyan Yellow Welcome', 'Red Green Welcome', 'Purple Orange Welcome', 'Red Welcome',
  'Purple Welcome', 'Blue Welcome', 'Colorful Jump', 'Red Green Blue Jump',
  'Cyan Purple Yellow Jump', 'Red Blue Jump', 'Red Green Jump', 'Red Purple Jump',
  'Blue Purple Jump', 'Red Green Blue Wave', 'Cyan Purple Yellow Wave', 'Orange Blue Purple Wave',
  'Blue Wave', 'Purple Wave', 'Red Wave', 'Yellow Wave', 'Purple White Purple Flow',
  'Red White Red Flow', 'Blue White Blue Flow', 'Green White Green Flow',
  'Yellow White Yellow Flow', 'Cyan White Cyan Flow', 'Orange White Orange Flow',
];

export const MUSIC_NAMES = [
  'Colorful Spectrum', 'Red Blue Spectrum', 'Red Green Spectrum', 'Green Blue Spectrum',
  'Red Yellow Spectrum', 'Cyan Yellow Purple Spectrum', 'Red Blue Orange Spectrum',
  'Colorful Extension', 'Red Blue Extension', 'Red Green Extension', 'Green Blue Extension',
  'Red Yellow Extension', 'Cyan Yellow Purple Extension', 'Red Blue Orange Extension',
  'Colorful Wave', 'Red Blue Wave', 'Red Green Wave', 'Green Blue Wave', 'Red Yellow Wave',
  'Cyan Yellow Purple Wave', 'Red Blue Orange Wave', 'Colorful Column', 'Red Blue Column',
  'Red Green Column', 'Green Blue Column', 'Red Yellow Column', 'Cyan Yellow Purple Column',
  'Red Blue Orange Column', 'Colorful Contraction', 'Red Blue Contraction', 'Red Green Contraction',
  'Green Blue Contraction', 'Red Yellow Contraction', 'Cyan Yellow Purple Contraction',
  'Red Blue Orange Contraction', 'Multi-color Rhythm', 'Red and Blue Rhythm',
  'Red and Green Rhythm', 'Green and Blue Rhythm', 'Red and Yellow Rhythm',
  'Cyan Yellow Purple Rhythm', 'Red Blue Orange Rhythm',
];

export const SHADOW_NAMES = [
  'Multi-color Fantasy', 'Red and Blue Fantasy', 'Red and Green Fantasy',
  'Yellow Cyan Purple Fantasy', 'Red White Blue Fantasy', 'Red Yellow Cyan Fantasy',
  'Red White Yellow Fantasy', 'Red Green Blue Transition', 'Yellow Cyan Purple Transition',
  'Six-color Transition Red', 'Six-color Transition Green', 'Six-color Transition Blue',
  'Six-color Transition Purple', 'Six-color Transition Orange', 'Seven-color Open-Close',
  'Red Green Blue Open-Close', 'Cyan Yellow Purple Open-Close', 'Red White Yellow Open-Close',
  'Blue White Cyan Open-Close', 'Red Blue Open-Close', 'Red Purple Open-Close',
  'Seven-color Gradient', 'Cyan Yellow Purple Gradient', 'Red Blue Gradient',
  'Red Yellow Gradient', 'Cyan Purple Gradient', 'Green Yellow Gradient', 'Red Green Gradient',
  'Red Green Blue Dynamic Shadow', 'Cyan Blue Purple Dynamic Shadow', 'Red Blue Dynamic Shadow',
  'Cyan Orange Dynamic Shadow', 'Red Purple Dynamic Shadow', 'Blue Green Dynamic Shadow',
  'Cyan Purple Dynamic Shadow', 'Multi-color Magic Flowing', 'Cyan Yellow Purple Magic Flowing',
  'Red Blue Magic Flowing', 'Yellow Purple Magic Flowing', 'Red Green Magic Flowing',
  'Red White Magic Flowing', 'Cyan Purple Magic Flowing', 'Blue Light Shadow', 'Purple Light Shadow',
  'Red Light Shadow', 'Green Light Shadow', 'Cyan Light Shadow', 'Orange Light Shadow',
  'Yellow Light Shadow', 'Red Green Blue Breathing', 'Cyan Yellow Purple Breathing',
  'Purple Orange Blue Breathing', 'Red Purple Breathing', 'Cyan Orange Breathing',
  'Blue Green Breathing', 'Cyan Purple Breathing', 'Colorful Stacking', 'Green-Blue Stacking',
  'Cyan-Yellow-Purple Stacking', 'Red Stacking', 'Blue Stacking', 'Green Stacking', 'Purple Stacking',
];

export const CATEGORIES = {
  dazzle: 'Magic Dazzle',
  music: 'Music Rhythm',
  shadow: 'Magic Shadow',
};

const NAME_TABLES = {
  dazzle: DAZZLE_NAMES,
  music: MUSIC_NAMES,
  shadow: SHADOW_NAMES,
};

/** `_a(prefix, extra)` - hex string + DECIMAL digits of `extra` + '3E'. */
function a(prefix, extra) {
  return hexToBytes(prefix + String(Math.trunc(Number(extra))) + '3E');
}

/**
 * Type A command for the Symphony page.
 *
 * @param {'dazzle'|'music'|'shadow'} kind
 * @param {number} mode 1-based
 * @returns {Uint8Array}
 */
export function payloadSymphonyA(kind, mode) {
  const m = Math.trunc(Number(mode));
  if (kind === 'dazzle') {
    if (m < 8) return a('3C3238303139', m + 30);
    if (m < 15) return a('3C3238303032', m + 23);
    if (m < 22) return a('3C3238303033', m + 16);
    if (m < 29) return a('3C3238303034', m + 9);
    if (m < 36) return a('3C3238303035', m + 2);
    if (m < 43) return a('3C3238303036', m - 5);
    if (m < 50) return a('3C3238303037', m - 12);
    if (m < 57) return a('3C3238303038', m - 19);
    if (m < 64) return a('3C3238303039', m - 26);
    throw new Error('dazzle mode 1-63');
  }
  if (kind === 'music') {
    if (m < 8) return a('3C3238303133', m + 30);
    if (m < 15) return a('3C3238303134', m + 23);
    if (m < 22) return a('3C3238303135', m + 16);
    if (m < 29) return a('3C3238303136', m + 9);
    if (m < 36) return a('3C3238303137', m + 2);
    if (m < 43) return a('3C3238303138', m - 5);
    throw new Error('music mode 1-42');
  }
  if (kind === 'shadow') {
    if (m < 8) return a('3C3238303237', m + 30);
    if (m < 15) return a('3C3238303041', m + 23);
    if (m < 22) return a('3C3238303042', m + 16);
    if (m < 29) return a('3C3238303044', m + 9);
    if (m < 36) return a('3C3238303045', m + 2);
    if (m < 43) return a('3C3238303046', m - 5);
    if (m < 50) return a('3C3238303130', m - 12);
    if (m < 57) return a('3C3238303131', m - 19);
    if (m < 64) return a('3C3238303132', m - 26);
    throw new Error('shadow mode 1-63');
  }
  throw new Error(String(kind));
}

/**
 * `names_for` - 1-based index/name pairs for a Symphony category.
 *
 * @param {'dazzle'|'music'|'shadow'} kind
 * @returns {Array<{index: number, name: string}>}
 */
export function namesFor(kind) {
  const table = Object.prototype.hasOwnProperty.call(NAME_TABLES, kind) ? NAME_TABLES[kind] : null;
  if (!table) throw new Error(String(kind));
  return table.map((name, i) => ({ index: i + 1, name }));
}
