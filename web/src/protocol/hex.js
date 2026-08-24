/**
 * Hex / byte primitives for the Cardi Magic BLE wire protocol.
 *
 * Pure, no I/O. Ported line-for-line from `../cardi_ble.py` so a side-by-side
 * diff stays trivially checkable. Every helper mirrors the exact Python
 * semantics used by the frame builders in `frames.js` / `symphony.js`:
 *   - `hexToBytes`  <-> `bytes.fromhex(...)`
 *   - `asciiFrame`  <-> `("<" + inner + ">").encode("ascii")`
 *   - `bytesToHex`  <-> `payload.hex(" ").upper()`
 */

const HEX_ALPHABET = '0123456789abcdefABCDEF';
const SKIPPABLE = ' \t\n\r';

/**
 * Parse a hex string into bytes. ASCII whitespace is ignored, exactly like
 * `bytes.fromhex` tolerates spaces between byte pairs.
 *
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError('hexToBytes: expected a string');
  }
  let clean = '';
  for (let i = 0; i < hex.length; i += 1) {
    const ch = hex[i];
    if (SKIPPABLE.indexOf(ch) !== -1) continue;
    if (HEX_ALPHABET.indexOf(ch) === -1) {
      throw new Error(`hexToBytes: invalid hex character ${JSON.stringify(ch)}`);
    }
    clean += ch;
  }
  if (clean.length % 2 !== 0) {
    throw new Error('hexToBytes: odd-length hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Render bytes as an uppercase hex string. Default separator is a single
 * space, so the output matches `payload.hex(' ').upper()` in Python - the
 * exact format used by the golden vectors.
 *
 * @param {Uint8Array|number[]} bytes
 * @param {string} [sep=' ']
 * @returns {string}
 */
export function bytesToHex(bytes, sep = ' ') {
  const list = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  const parts = new Array(list.length);
  for (let i = 0; i < list.length; i += 1) {
    parts[i] = list[i].toString(16).toUpperCase().padStart(2, '0');
  }
  return parts.join(sep);
}

/**
 * Wrap an ASCII command in the Type A frame delimiters: 0x3C ... 0x3E.
 * Mirrors `_ascii_frame` in cardi_ble.py.
 *
 * @param {string} inner
 * @returns {Uint8Array}
 */
export function asciiFrame(inner) {
  const text = `<${String(inner)}>`;
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) {
      throw new Error('asciiFrame: non-ASCII character in payload');
    }
    out[i] = code;
  }
  return out;
}

/**
 * View the same memory as a DataView (handy for transports that want one).
 *
 * @param {Uint8Array} bytes
 * @returns {DataView}
 */
export function toDataView(bytes) {
  const list = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes || []);
  return new DataView(list.buffer, list.byteOffset, list.byteLength);
}

/**
 * Parse '#rrggbb', 'rrggbb', '#rgb' or 'rgb' into channel integers 0..255.
 *
 * @param {string} hex
 * @returns {{r: number, g: number, b: number}}
 */
export function hexToRgb(hex) {
  let raw = String(hex == null ? '' : hex).trim();
  if (raw.startsWith('#')) raw = raw.slice(1);
  if (raw.length === 3) {
    raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  }
  if (raw.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new Error(`hexToRgb: expected #rrggbb, got ${JSON.stringify(hex)}`);
  }
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

/**
 * Build a lowercase '#rrggbb' string. Channels are clamped to 0..255.
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** CSS `rgba()` from a hex. Android WebView still drops `color-mix()`. */
export function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function channel(value) {
  const n = Math.round(Number(value));
  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 0;
  return clamped.toString(16).padStart(2, '0');
}
