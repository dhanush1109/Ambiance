/**
 * Cardi Magic BLE frame builders. Pure, no I/O.
 *
 * Ported LINE-FOR-LINE from `../cardi_ble.py`. The string-based construction is
 * preserved deliberately: several branches build a HEX STRING and format a
 * value as DECIMAL digits that are then read as hex digits (the "+30" trick).
 * That looks like a bug but it is exactly how the real APK encodes ASCII -
 * see ../PROTOCOL.md. Do not "fix" it.
 *
 * Two dialects, chosen from the advertised BLE name:
 *   Type A (ATW- / atw- / VE-CD)  ASCII wrapped in 0x3C ... 0x3E
 *   Type B (CD-AMB)               fixed 7-byte binary 0x3B ... 0xB3
 *
 * The pinned Hycross controller (ATW-FWD-AAA6) is Type A; Type B is ported for
 * completeness so the module is a faithful mirror of the Python source.
 */

import { asciiFrame, hexToBytes } from './hex.js';

export const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
export const CHAR_FFE1 = '0000ffe1-0000-1000-8000-00805f9b34fb';
export const CHAR_FFE2 = '0000ffe2-0000-1000-8000-00805f9b34fb';

/** Firmware zones. The controller exposes exactly three. */
export const ZONE = { FRONT: 1, REAR: 2, ALL: 3 };

export const NAME_TYPE_A = ['ATW-', 'atw-', 'VE-CD'];
export const NAME_TYPE_B = ['CD-AMB'];

/** Type B RGB zone byte (`ZONE_RGB` in cardi_ble.py). */
export const ZONE_RGB = { 1: 0x01, 2: 0x02, 3: 0x03 };
/** Type B brightness zone byte (`ZONE_BRIGHT` in cardi_ble.py). */
export const ZONE_BRIGHT = { 1: 0xf1, 2: 0xf2, 3: 0xf3 };

/** Type A ASCII prefixes, straight from the Python dict literals. */
const RGB_PREFIX_A = { 1: '10', 2: '09', 3: '06' };
const BRIGHT_PREFIX_A = { 1: '01010', 2: '01020', 3: '02000' };

/** playmode2() MM byte for Type B (`_ANIM_B_MM`). */
const ANIM_B_MM = {
  1: 0x07, 2: 0x04, 3: 0x08, 4: 0x05, 5: 0x0a, 6: 0x02, 7: 0x01,
  8: 0x05, 9: 0x02, 10: 0x03, 11: 0x09, 12: 0x06, 13: 0x21, 14: 0x1d,
  15: 0x20, 16: 0x1f, 17: 0x1e, 18: 0x22, 19: 0x23, 20: 0x1b, 21: 0x1c,
  22: 0x12, 23: 0x11, 24: 0x13, 25: 0x18, 26: 0x14, 27: 0x19, 28: 0x15,
  29: 0x16, 30: 0x17, 31: 0x1a,
};

const SCENES_B = {
  rainbow: [0x3b, 0x34, 0x34, 0x34, 0x34, 0x07, 0xb3],
  flash: [0x3b, 0x34, 0x34, 0x34, 0x34, 0x21, 0xb3],
  breathe: [0x3b, 0x34, 0x34, 0x34, 0x34, 0x18, 0xb3],
  music: [0x3b, 0x34, 0x34, 0x34, 0x34, 0x0b, 0xb3],
};

/** Inner ASCII of the Type A scene frames (`b"<040000>"` etc). */
const SCENES_A = {
  rainbow: '040000',
  flash: '04000c',
  breathe: '040018',
  music: '040501',
};

/**
 * `classify_name` - which dialect a BLE advert name speaks.
 * Type B is checked first, exactly as in Python.
 *
 * @param {string|null|undefined} name
 * @returns {'A'|'B'|null}
 */
export function classifyName(name) {
  if (!name) return null;
  for (const token of NAME_TYPE_B) {
    if (name.indexOf(token) !== -1) return 'B';
  }
  for (const token of NAME_TYPE_A) {
    if (name.indexOf(token) !== -1) return 'A';
  }
  return null;
}

/**
 * `write_uuid_for` - CD-AMB swaps write/notify, everything else writes FFE2.
 *
 * @param {'A'|'B'|string|null} hw
 * @returns {string}
 */
export function writeUuidFor(hw) {
  return hw === 'B' ? CHAR_FFE1 : CHAR_FFE2;
}

/**
 * `payload_power`
 *
 * @param {'A'|'B'|string} hw
 * @param {boolean} on
 * @returns {Uint8Array}
 */
export function payloadPower(hw, on) {
  if (hw === 'B') {
    return hexToBytes(on ? '3B30000000F0B3' : '3B300000000FB3');
  }
  return asciiFrame(on ? '0701' : '0700');
}

/**
 * `payload_rgb`. Type A prefixes are {1:'10', 2:'09', 3:'06'} followed by
 * lowercase rrggbb; Type B is the 7-byte binary frame.
 *
 * @param {'A'|'B'|string} hw
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} [zone=3]
 * @returns {Uint8Array}
 */
export function payloadRgb(hw, r, g, b, zone = 3) {
  if (hw === 'B') {
    return Uint8Array.from([
      0x3b, 0x33, zoneLookup(ZONE_RGB, zone), r & 0xff, g & 0xff, b & 0xff, 0xb3,
    ]);
  }
  const prefix = zoneLookup(RGB_PREFIX_A, zone);
  return asciiFrame(`${prefix}${lowerHex2(r)}${lowerHex2(g)}${lowerHex2(b)}`);
}

/**
 * `payload_brightness`. Level is clamped to 0..9 - the firmware scale is
 * 0-9, never 0-100. Type A prefixes are {1:'01010', 2:'01020', 3:'02000'}
 * followed by the raw digit, which becomes the ASCII byte 0x30..0x39.
 *
 * @param {'A'|'B'|string} hw
 * @param {number} level
 * @param {number} [zone=3]
 * @returns {Uint8Array}
 */
export function payloadBrightness(hw, level, zone = 3) {
  const lvl = Math.max(0, Math.min(9, toInt(level)));
  if (hw === 'B') {
    return Uint8Array.from([
      0x3b, 0x39, zoneLookup(ZONE_BRIGHT, zone), 0x00, 0x00, lvl, 0xb3,
    ]);
  }
  const prefix = zoneLookup(BRIGHT_PREFIX_A, zone);
  return asciiFrame(prefix + String(lvl));
}

/**
 * `payload_scene` - scene is 'rainbow' | 'flash' | 'breathe' | 'music'.
 *
 * @param {'A'|'B'|string} hw
 * @param {string} scene
 * @returns {Uint8Array}
 */
export function payloadScene(hw, scene) {
  if (hw === 'B') {
    const frame = Object.prototype.hasOwnProperty.call(SCENES_B, scene) ? SCENES_B[scene] : null;
    if (!frame) throw new Error(`Unknown scene: ${scene}`);
    return Uint8Array.from(frame);
  }
  const inner = Object.prototype.hasOwnProperty.call(SCENES_A, scene) ? SCENES_A[scene] : null;
  if (!inner) throw new Error(`Unknown scene: ${scene}`);
  return asciiFrame(inner);
}

/**
 * `payload_rgb_mode` - official RGB animation from rgbFragment.playmode1/2.
 * `select` is 1..31.
 *
 * QUIRK (intentional, do not touch): the Type A branch builds a HEX STRING and
 * appends `extra` as TWO DECIMAL DIGITS which are then parsed as hex digits.
 * select=1 -> extra 30 -> byte 0x30 -> ASCII '0'. Every threshold below is
 * verbatim from Python.
 *
 * @param {'A'|'B'|string} hw
 * @param {number} select
 * @returns {Uint8Array}
 */
export function payloadRgbMode(hw, select) {
  const sel = Math.max(1, Math.min(31, toInt(select)));
  if (hw === 'B') {
    return Uint8Array.from([0x3b, 0x34, 0x34, 0x34, 0x34, ANIM_B_MM[sel], 0xb3]);
  }
  let prefix;
  let extra;
  if (sel < 11) {
    prefix = '3C3034303030';
    extra = sel + 29;
  } else if (sel < 13) {
    prefix = '3C3034303031';
    extra = sel + 19;
  } else if (sel < 22) {
    prefix = '3C3034303130';
    extra = sel + 17;
  } else if (sel < 25) {
    prefix = '3C3034303230';
    extra = sel + 8;
  } else {
    prefix = '3C3034303430';
    extra = sel + 5;
  }
  return hexToBytes(prefix + dec2(extra) + '3E');
}

/** UI speed is 1 (slowest) … 6 (fastest). Firmware is still 0..10. */
export const SPEED_UI_MIN = 1
export const SPEED_UI_MAX = 6

/**
 * Spread 1–6 across the box's full 0–10 range so each step is a real jump:
 * 1 → 0 (crawl), 6 → 10 (sprint).
 */
export function uiSpeedToFirmware(ui) {
  const n = Math.max(SPEED_UI_MIN, Math.min(SPEED_UI_MAX, toInt(ui) || SPEED_UI_MIN))
  return Math.round(((n - SPEED_UI_MIN) * 10) / (SPEED_UI_MAX - SPEED_UI_MIN))
}

/**
 * `payload_speed` — official RGB / Symphony seekbar, 0..10.
 *
 * Type A uses the same +30 ASCII trick as brightness. Level 10 would make
 * `10 + 30 = 40`, an odd-length hex string, so the APK substitutes 61 ('a').
 * RGB page:  `<3e0X>`   Symphony page: `<0b0X>`.
 * Type B is a single global frame `3B 38 F3 00 00 LL B3`.
 *
 * @param {'A'|'B'|string} hw
 * @param {number} level
 * @param {'rgb'|'symphony'} [family='rgb']
 * @returns {Uint8Array}
 */
export function payloadSpeed(hw, level, family = 'rgb') {
  const lvl = Math.max(0, Math.min(10, toInt(level)));
  if (hw === 'B') {
    return Uint8Array.from([0x3b, 0x38, 0xf3, 0x00, 0x00, lvl, 0xb3]);
  }
  const extra = lvl === 10 ? 61 : lvl + 30;
  const prefix = family === 'symphony' ? '3C306230' : '3C336530';
  return hexToBytes(prefix + dec2(extra) + '3E');
}

/** `f"{value:02x}"` on a raw channel value - lowercase, zero padded to 2. */
function lowerHex2(value) {
  return Math.trunc(Number(value)).toString(16).padStart(2, '0');
}

/** `f"{value:02d}"` - DECIMAL digits, zero padded to 2. */
function dec2(value) {
  return String(Math.trunc(Number(value))).padStart(2, '0');
}

function toInt(value) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : 0;
}

/** Python `TABLE[zone]` - raises on anything outside 1/2/3. */
function zoneLookup(table, zone) {
  const key = toInt(zone);
  if (!Object.prototype.hasOwnProperty.call(table, key)) {
    throw new Error(`Unknown zone: ${zone} (expected 1, 2 or 3)`);
  }
  return table[key];
}
