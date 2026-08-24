/**
 * Effect previews — turn a firmware animation name into something you can look at.
 *
 * The controller's 199 mode names (31 RGB + 63 Magic Dazzle + 42 Music Rhythm +
 * 63 Magic Shadow) are colour-descriptive — "Cyan Yellow Purple Flow",
 * "Red Blue Chasing", "Seven-color Gradient" — and that is the only preview data
 * the hardware gives us, so we parse it: colorsFor() reads the colour words,
 * motionFor() reads the verb, gradientFor() renders the two together.
 *
 * Every result is deterministic per name and memoised (the Effects screen draws
 * all 199 at once). Hash-derived variation in angle, stop skew and skew phase
 * keeps same-colour/same-motion siblings — "Colorful Spectrum" vs "Colorful
 * Wave" — from rendering as identical twins: 199 names, 192 distinct gradients,
 * the only repeats being names that are genuinely identical across families.
 *
 * Colours are deliberately vivid: these chips sit on a near-black card.
 */

import { hexToRgb, rgbToHex } from '../protocol/hex.js';

const RED = '#ff2d2d';
const ORANGE = '#ff8a2b';
const YELLOW = '#ffd426';
const GREEN = '#26e06b';
const CYAN = '#22e0e8';
const BLUE = '#2e6bff';
const PURPLE = '#a855f7';
const PINK = '#ff5fa2';
const WHITE = '#f2f5fa';

/** Single colour words the firmware uses, plus two safe aliases. A Map, so a
    stray word like "constructor" can never resolve to an inherited property. */
const WORDS = new Map([
  ['red', RED], ['orange', ORANGE], ['yellow', YELLOW], ['green', GREEN],
  ['cyan', CYAN], ['blue', BLUE], ['purple', PURPLE], ['violet', PURPLE],
  ['pink', PINK], ['magenta', PINK], ['white', WHITE],
]);

/** "Colorful" / "Seven-color" / "Rainbow" -> the full spectrum. */
const SEVEN = [RED, ORANGE, YELLOW, GREEN, CYAN, BLUE, PURPLE];
/** "Six-color" -> the six-step wheel the firmware cycles (no cyan). */
const SIX = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE];

/** Single-word wildcards. "color"/"colors" alone covers "Color Flow". */
const WILDCARDS = new Set([
  'colorful', 'colourful', 'multicolor', 'multicolour', 'rainbow',
  'color', 'colors', 'colour', 'colours',
]);

/**
 * Motion word -> behaviour. Order matters, earlier patterns win: 'dynamic
 * shadow' must be tested before 'light shadow', and 'flow' catches "Magic
 * Flowing". Between them these cover every one of the 199 firmware names, so
 * 'static' is only ever reached by a name we have never seen.
 */
const MOTION_TABLE = [
  ['breath', 'breathe'], ['flash', 'flash'], ['jump', 'jump'],
  ['chas', 'trail'], ['trail', 'trail'], ['wave', 'wave'], ['flow', 'flow'],
  ['gradient', 'flow'], ['transition', 'flow'], ['fantasy', 'flow'],
  ['dynamic shadow', 'flow'], ['light shadow', 'breathe'],
  ['open close', 'breathe'], ['contraction', 'breathe'], ['closing', 'wave'],
  ['curtain', 'wave'], ['extension', 'wave'], ['spectrum', 'wave'],
  ['welcome', 'wave'], ['stacking', 'jump'], ['column', 'jump'],
  ['rhythm', 'flash'],
];

const MAX_STOPS = 8;
const GROUND = { r: 10, g: 11, b: 14 };
const PAPER = { r: 255, g: 255, b: 255 };

/* Three independent FNV offset bases give three uncorrelated variation axes
   (angle, stop skew, skew phase) from one name — enough spread that no two of
   the 199 firmware names land on the same gradient unless the names match. */
const SEED_A = 0x811c9dc5;
const SEED_B = 0x2545f491;
const SEED_C = 0x9e3779b1;

const colorCache = new Map();
const motionCache = new Map();
const gradientCache = new Map();

/**
 * Colour words parsed from a mode name, in order of appearance.
 *
 * Wildcards ("Colorful", "Multi-color", "Seven-color", "Six-color", "Rainbow",
 * and a bare "Color") expand to a spectrum set. When a wildcard is paired with
 * an explicit colour — "Six-color Transition Green" — the spectrum is rotated to
 * start on that colour, which is exactly what the firmware does and keeps the
 * five "Six-color Transition ..." siblings visually distinct.
 *
 * A name with a single colour ("Red Trail") returns a three-stop glow ramp of
 * that colour so a gradient is always possible. Never returns fewer than two.
 *
 * @param {string} name
 * @returns {string[]} hex colours, 2..8 entries
 */
export function colorsFor(name) {
  const key = normalize(name);
  const cached = colorCache.get(key);
  if (cached) return cached.slice();

  const words = key ? key.split(' ') : [];
  const explicit = [];
  let wildcard = null;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = words[i + 1];
    if (next === 'color' || next === 'colors' || next === 'colour' || next === 'colours') {
      if (word === 'seven') { wildcard = wildcard || SEVEN; i += 1; continue; }
      if (word === 'six') { wildcard = wildcard || SIX; i += 1; continue; }
      if (word === 'multi') { wildcard = wildcard || SEVEN; i += 1; continue; }
    }
    if (WILDCARDS.has(word)) { wildcard = wildcard || SEVEN; continue; }
    if (word === 'rgb') { explicit.push(RED, GREEN, BLUE); continue; }
    if (WORDS.has(word)) explicit.push(WORDS.get(word));
  }

  let out;
  if (wildcard && explicit.length) {
    const at = wildcard.indexOf(explicit[0]);
    if (at > 0) out = wildcard.slice(at).concat(wildcard.slice(0, at));
    else if (at === 0) out = wildcard.slice();
    else out = [explicit[0]].concat(wildcard);
  } else if (wildcard) {
    out = wildcard.slice();
  } else {
    out = explicit;
  }

  out = collapse(out).slice(0, MAX_STOPS);
  if (out.length === 0) out = fallbackColors(hash(key, SEED_A));
  if (out.length === 1) out = [tint(out[0], 0.38), out[0], shade(out[0], 0.62)];

  colorCache.set(key, out);
  return out.slice();
}

/**
 * The motion verb hidden in a mode name.
 *
 * @param {string} name
 * @returns {'flow'|'flash'|'breathe'|'jump'|'wave'|'trail'|'static'}
 */
export function motionFor(name) {
  const key = normalize(name);
  const cached = motionCache.get(key);
  if (cached) return cached;

  let motion = 'static';
  for (let i = 0; i < MOTION_TABLE.length; i += 1) {
    if (key.indexOf(MOTION_TABLE[i][0]) !== -1) {
      motion = MOTION_TABLE[i][1];
      break;
    }
  }
  motionCache.set(key, motion);
  return motion;
}

/**
 * A CSS gradient preview for a mode name. Geometry follows the motion:
 * flow/wave sweep, trail fades into its own shadow, jump and flash use hard
 * bands, breathe blooms from the centre, static falls straight down.
 *
 * @param {string} name
 * @returns {string} a `linear-gradient(...)` / `radial-gradient(...)` value
 */
export function gradientFor(name) {
  const key = normalize(name);
  const cached = gradientCache.get(key);
  if (cached) return cached;

  const colors = colorsFor(name);
  const motion = motionFor(name);
  const h1 = hash(key, SEED_A);
  const h2 = hash(key, SEED_B);
  const h3 = hash(key, SEED_C);
  const bias = spread(h2, 11) / 100;
  const phase = (h3 % 8) * (Math.PI / 4);
  let css;

  switch (motion) {
    case 'jump':
      css = bands(colors, 90 + spread(h1, 14), 0, bias, phase);
      break;
    case 'flash':
      css = bands(colors, 90 + spread(h1, 12), 0.4, bias, phase);
      break;
    case 'breathe':
      css = bloom(colors, 34 + (h1 % 33), bias, phase);
      break;
    case 'trail':
      css = trail(colors, 74 + spread(h1, 20), 70 + (h2 % 14), bias, phase);
      break;
    case 'wave':
      css = sweep(colors, 128 + spread(h1, 24), bias, phase);
      break;
    case 'static':
      css = sweep(colors, 180, 0, 0);
      break;
    case 'flow':
    default:
      css = sweep(colors, 96 + spread(h1, 18), bias, phase);
      break;
  }

  gradientCache.set(key, css);
  return css;
}

/* ------------------------------------------------------------------ */
/* internals                                                           */
/* ------------------------------------------------------------------ */

/** Lowercase, punctuation (including '-') to single spaces. */
function normalize(name) {
  return String(name == null ? '' : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Drop immediate repeats so "Red Red Flow" does not waste a stop. */
function collapse(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    if (out.length === 0 || out[out.length - 1] !== list[i]) out.push(list[i]);
  }
  return out;
}

/** Deterministic 32-bit FNV-1a with a selectable offset basis. */
function hash(text, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic integer in [-span, span]. */
function spread(h, span) {
  return ((h >>> 0) % (span * 2 + 1)) - span;
}

/** Three vivid, distinct colours for a name we could not parse at all. */
function fallbackColors(h) {
  const wheel = SEVEN;
  const start = h % wheel.length;
  return [
    wheel[start],
    wheel[(start + 2) % wheel.length],
    wheel[(start + 4) % wheel.length],
  ];
}

function mix(hex, target, amount) {
  const c = hexToRgb(hex);
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    c.r + (target.r - c.r) * t,
    c.g + (target.g - c.g) * t,
    c.b + (target.b - c.b) * t,
  );
}

function tint(hex, amount) {
  return mix(hex, PAPER, amount);
}

function shade(hex, amount) {
  return mix(hex, GROUND, amount);
}

function pct(value) {
  return Math.round(value * 10) / 10;
}

/**
 * `n` stop positions in 0..1, anchored at both ends and strictly increasing.
 * `bias` (|bias| <= 0.11, so the ramp can never fold back on itself) and
 * `phase` bend the spacing, which is what makes two effects that share colours
 * and motion — "Colorful Curtain" and "Colorful Curtain 2" — look different.
 */
function ramp(n, bias, phase) {
  if (n <= 1) return [0];
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    out[i] = t + bias * Math.sin(Math.PI * 2 * t + phase);
  }
  const lo = out[0];
  const span = out[n - 1] - lo || 1;
  for (let i = 0; i < n; i += 1) out[i] = (out[i] - lo) / span;
  return out;
}

/**
 * A two-colour gradient has no interior stop for `ramp` to move, so every
 * two-colour effect of the same pair would render identically. Give it a
 * blended middle; where that blend sits then carries the variation.
 */
function expand(colors) {
  if (colors.length !== 2) return colors;
  return [colors[0], mix(colors[0], hexToRgb(colors[1]), 0.5), colors[1]];
}

/** Smooth sweep — flow, wave, static. */
function sweep(colors, angle, bias, phase) {
  const list = expand(colors);
  const stops = ramp(list.length, bias, phase);
  const parts = list.map((c, i) => `${c} ${pct(stops[i] * 100)}%`);
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

/** Hard-edged bands. `gap` (0..1) cuts a dark slot into the end of each band. */
function bands(colors, angle, gap, bias, phase) {
  const n = colors.length;
  const edges = ramp(n + 1, bias, phase);
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const start = edges[i] * 100;
    const end = edges[i + 1] * 100;
    if (gap > 0) {
      const cut = end - (end - start) * gap;
      const dark = shade(colors[i], 0.82);
      parts.push(`${colors[i]} ${pct(start)}%`, `${colors[i]} ${pct(cut)}%`);
      parts.push(`${dark} ${pct(cut)}%`, `${dark} ${pct(end)}%`);
    } else {
      parts.push(`${colors[i]} ${pct(start)}%`, `${colors[i]} ${pct(end)}%`);
    }
  }
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

/** Colours up front, fading into their own shadow — a chasing tail. */
function trail(colors, angle, tail, bias, phase) {
  const list = expand(colors);
  const last = list[list.length - 1];
  const stops = ramp(list.length, bias, phase);
  const parts = list.map((c, i) => `${c} ${pct(stops[i] * tail)}%`);
  parts.push(`${shade(last, 0.55)} ${pct(tail + (100 - tail) * 0.5)}%`);
  parts.push(`${shade(last, 0.9)} 100%`);
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

/** Centre bloom for breathing / open-close style effects. */
function bloom(colors, cx, bias, phase) {
  const list = expand(colors);
  const n = list.length;
  const stops = ramp(n, bias, phase);
  const parts = [`${tint(list[0], 0.3)} 0%`];
  for (let i = 0; i < n; i += 1) {
    parts.push(`${list[i]} ${pct(14 + stops[i] * 64)}%`);
  }
  parts.push(`${shade(list[n - 1], 0.74)} 100%`);
  return `radial-gradient(circle at ${pct(cx)}% 50%, ${parts.join(', ')})`;
}
