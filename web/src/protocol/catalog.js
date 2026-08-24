/**
 * Catalogue of everything the ATW-FWD-AAA6 controller can actually do.
 *
 * Hardware truth: the firmware links the 19 LED pieces into exactly THREE
 * zones. Per-piece colour is impossible. Animations are global-only -
 * they cannot be scoped to a zone.
 *
 * RGB animation names are the official rgbmoshi1..31 strings, copied from
 * `../cardi_ble.py`; Symphony names live in `symphony.js`.
 */

import { namesFor } from './symphony.js';

/** 31 official RGB page animations, 1-based like the APK. */
export const RGB_ANIMATIONS = [
  { index: 1, name: 'Rainbow Gradient' },
  { index: 2, name: 'Red-Purple Gradient' },
  { index: 3, name: 'Cyan-Orange Gradient' },
  { index: 4, name: 'Blue-Yellow Gradient' },
  { index: 5, name: 'Cyan-Purple Gradient' },
  { index: 6, name: 'Red-Green Gradient' },
  { index: 7, name: 'Red-Blue Gradient' },
  { index: 8, name: 'Green-Blue Gradient' },
  { index: 9, name: 'Red-Green Gradient 2' },
  { index: 10, name: 'Red-Green-Blue Gradient' },
  { index: 11, name: 'Cyan-Yellow-Purple Gradient' },
  { index: 12, name: 'Blue-Purple-White Gradient' },
  { index: 13, name: 'Colorful Flash' },
  { index: 14, name: 'Red Flash' },
  { index: 15, name: 'Green Flash' },
  { index: 16, name: 'Blue Flash' },
  { index: 17, name: 'Yellow Flash' },
  { index: 18, name: 'Cyan Flash' },
  { index: 19, name: 'Purple Flash' },
  { index: 20, name: 'White Flash' },
  { index: 21, name: 'Red-Green-Blue Flash' },
  { index: 22, name: 'Colorful Jump' },
  { index: 23, name: 'Red-Green-Blue Jump' },
  { index: 24, name: 'Cyan-Purple-Orange Jump' },
  { index: 25, name: 'Colorful Breathing' },
  { index: 26, name: 'Red-Green-Blue Breathing' },
  { index: 27, name: 'Cyan-Purple-Orange Breathing' },
  { index: 28, name: 'Red Breathing' },
  { index: 29, name: 'Blue Breathing' },
  { index: 30, name: 'Green Breathing' },
  { index: 31, name: 'Purple Breathing' },
];

/**
 * The only three zones the controller exposes. `pieces` is the honest
 * physical count behind each firmware zone.
 */
export const ZONES = [
  { id: 3, name: 'All cabin', short: 'All', pieces: 19 },
  { id: 1, name: 'Front cabin', short: 'Front', pieces: 12 },
  { id: 2, name: 'Handles & feet', short: 'Handles', pieces: 7 },
];

/** The four animation families and how many modes each holds. */
export const FAMILIES = [
  { key: 'rgb', title: 'RGB', count: 31 },
  { key: 'dazzle', title: 'Magic Dazzle', count: 63 },
  { key: 'music', title: 'Music Rhythm', count: 42 },
  { key: 'shadow', title: 'Magic Shadow', count: 63 },
];

/**
 * Every mode in a family as 1-based `{ index, name }` pairs.
 *
 * @param {'rgb'|'dazzle'|'music'|'shadow'} family
 * @returns {Array<{index: number, name: string}>}
 */
export function modesFor(family) {
  if (family === 'rgb') {
    return RGB_ANIMATIONS.map((item) => ({ index: item.index, name: item.name }));
  }
  return namesFor(family);
}
