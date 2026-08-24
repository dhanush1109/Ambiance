/**
 * One icon family, drawn on a 24×24 grid with a 1.75 stroke.
 * Consistency here is most of what makes an interface feel considered.
 * No emoji anywhere in this app — emoji render differently on every device and
 * cannot be themed.
 */

const P = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  moods: 'M12 3a9 9 0 1 0 9 9c0-.7-1-1-1.5-.5s-1.5.5-2.2 0-.6-1.6 0-2.2.4-1.6-.4-1.9A9 9 0 0 0 12 3Z',
  effects: 'M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1',
  favorites: 'M12 4.6l2.3 4.7 5.2.8-3.7 3.6.9 5.1-4.7-2.4-4.7 2.4.9-5.1L4.5 10l5.2-.8L12 4.6Z',
  settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 14H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.5 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
  power: 'M12 3.5v8M7.3 6.3a7.5 7.5 0 1 0 9.4 0',
  bluetooth: 'M7.5 7.5 16.5 16.5 12 20.5V3.5l4.5 4L7.5 16.5',
  link: 'M10.5 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5M13.5 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5L12 17',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  'chevron-right': 'M9.5 5.5 16 12l-6.5 6.5',
  'chevron-left': 'M14.5 5.5 8 12l6.5 6.5',
  'chevron-down': 'M5.5 9.5 12 16l6.5-6.5',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7M10 10.5v6M14 10.5v6',
  star: 'M12 4.6l2.3 4.7 5.2.8-3.7 3.6.9 5.1-4.7-2.4-4.7 2.4.9-5.1L4.5 10l5.2-.8L12 4.6Z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2m0 15v2M2.5 12h2m15 0h2M5.1 5.1l1.4 1.4m11 11 1.4 1.4m0-13.8-1.4 1.4m-11 11-1.4 1.4',
  moon: 'M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 3.5V9h-5.5',
  alert: 'M12 8.5v5m0 3.2v.3M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  close: 'M6 6l12 12M18 6 6 18',
  drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  play: 'M8 5.5v13l11-6.5-11-6.5Z',
  stop: 'M6.5 6.5h11v11h-11z',
  info: 'M12 11v5.5M12 7.7v.3M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  car: 'M4.5 16.5v2.2M19.5 16.5v2.2M3 16.5h18v-4l-1.8-.7-2-4.3a2 2 0 0 0-1.8-1.1H8.6a2 2 0 0 0-1.8 1.1l-2 4.3-1.8.7v4ZM7 13.8h.01M17 13.8h.01M4.8 11.8h14.4',
  brightness: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2.8v2.4m0 13.6v2.4M2.8 12h2.4m13.6 0h2.4M5.4 5.4l1.7 1.7m9.8 9.8 1.7 1.7m0-13.2-1.7 1.7m-9.8 9.8-1.7 1.7',
  palette: 'M12 21a9 9 0 1 1 0-18c4.7 0 9 3.1 9 7 0 2.5-2 3.8-4 3.8h-1.6c-1.2 0-2.1 1-2.1 2.1 0 .5.2 1 .5 1.4.3.4.4.8.4 1.2 0 1.4-1 1.5-2.2 1.5ZM7.5 10.5h.01M10.5 7h.01M15 7.5h.01',
}

/** Glyphs that read better filled when active. */
const FILLABLE = new Set(['favorites', 'star', 'play', 'stop'])

export default function Icon({ name, size = 24, filled = false, title, className = '', ...rest }) {
  const d = P[name]
  if (!d) return null

  const solid = filled && FILLABLE.has(name)
  const labelled = Boolean(title)

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? title : undefined}
      aria-hidden={labelled ? undefined : 'true'}
      focusable="false"
      {...rest}
    >
      <path d={d} />
    </svg>
  )
}
