/**
 * The pinned controller.
 *
 * WHY THIS EXISTS
 * ---------------
 * Lumen is not a generic BLE lighting app. It drives exactly one piece of
 * hardware: the ATW-FWD-AAA6 ambient-light controller fitted to one Toyota
 * Innova Hycross. There is one car, one controller, one MAC address — forever.
 *
 * Pinning that address buys three things a scan-first app cannot have:
 *   1. Speed — `controller.connectPinned()` opens a GATT connection straight to
 *      the MAC. No advertisement window to wait on, no scan permission dance,
 *      so the lights come up in about a second after the door shuts.
 *   2. Certainty — a car park full of BLE strips, another Cardi Magic unit in
 *      the next bay, a neighbour's ATW controller: none of them can be reached
 *      by accident. The pin is the safety interlock.
 *   3. Honesty — every screen can talk about "your controller" instead of
 *      making the driver identify hardware from a list of MAC addresses.
 *
 * Scanning still exists, but only as a diagnostic fallback. While `ENFORCE_PIN`
 * is true, scan results are split into `pinned` / `others` and connecting to
 * anything in `others` is refused with an explanation rather than silently
 * bonding to a stranger's device.
 *
 * If the controller is ever replaced, this file is the single line to edit.
 */

/**
 * @typedef {{mac: string, name: string, hw: 'A'|'B'}} PinnedDevice
 */

/** The one and only controller this app talks to. @type {PinnedDevice} */
export const PINNED_DEVICE = {
  mac: '7B:F7:38:62:BA:8A',
  name: 'ATW-FWD-AAA6',
  hw: 'A',
};

/**
 * When true, connect paths refuse any address that is not `PINNED_DEVICE.mac`.
 * Flip to false only for bench work against a spare controller.
 * @type {boolean}
 */
export const ENFORCE_PIN = true;

/** 12 hex characters with no separators — a bare 6-octet MAC. */
const BARE_MAC = /^[0-9a-fA-F]{12}$/;

/** Anything platforms use between octets: ':', '-', '.', '_' or whitespace. */
const SEPARATORS = /[\s:._-]/g;

/**
 * Canonicalise a device address for comparison.
 *
 * Accepts every shape the platforms hand us:
 *   '7b:f7:38:62:ba:8a'  ->  '7B:F7:38:62:BA:8A'   (Android, lowercase)
 *   '7B-F7-38-62-BA-8A'  ->  '7B:F7:38:62:BA:8A'   (Windows / bridge)
 *   ' 7bf7386 2ba8a '    ->  '7B:F7:38:62:BA:8A'   (bare, stray whitespace)
 *
 * Some platforms (iOS, and Chrome's Web Bluetooth) never expose a MAC at all —
 * they hand back an opaque UUID-style identifier. Those are NOT 6-octet MACs,
 * so they are returned trimmed and uppercased but otherwise untouched: still a
 * stable key for equality, never an exception.
 *
 * @param {string|null|undefined} addr
 * @returns {string} canonical address, or '' for empty/absent input
 */
export function normalizeMac(addr) {
  if (addr == null) return '';
  const raw = String(addr).trim();
  if (!raw) return '';

  const compact = raw.replace(SEPARATORS, '');
  if (!BARE_MAC.test(compact)) {
    // Not a MAC (UUID-style id, device name, partial string) — pass it through
    // uppercased so callers can still compare it safely.
    return raw.toUpperCase();
  }

  const upper = compact.toUpperCase();
  const octets = new Array(6);
  for (let i = 0; i < 6; i += 1) {
    octets[i] = upper.slice(i * 2, i * 2 + 2);
  }
  return octets.join(':');
}

/**
 * Is this address the pinned controller?
 *
 * @param {string|null|undefined} addr
 * @returns {boolean}
 */
export function isPinnedAddress(addr) {
  const candidate = normalizeMac(addr);
  if (!candidate) return false;
  return candidate === normalizeMac(PINNED_DEVICE.mac);
}
