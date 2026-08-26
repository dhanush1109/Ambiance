import { useMemo, useState, useEffect, useRef, useId } from 'react'
import {
  BODY_D,
  CAR_VIEWBOX,
  CABIN_CHROME,
  DOORS,
  PIECES,
  ZONE_CAPTION,
} from '../data/pieces'
import { useConnectionStore } from '../state/connectionStore'
import { useLaunchStore } from '../state/launchStore'
import { haptics } from '../services/haptics'
import './CarHero.css'

/** Matches --dur-draw. A floor so a missing animationend cannot leave the tracer on. */
const DRAW_MS = 1200

/**
 * The landing page's centrepiece: your car from above, its four doors, lit in
 * the colours the controller is actually driving right now.
 *
 * Two performance rules hold this together:
 *  - The lit pieces render in exactly TWO <g> groups, one per zone, each with
 *    ONE shared glow filter. Nineteen individual filters would crawl on a
 *    mid-range tablet.
 *  - Every gradient here is static, so it rasterises once. Nothing animated
 *    carries a filter or a blur.
 */
export default function CarHero({
  zones,
  selectedZone = 3,
  power = false,
  activeMode = null,
  onSelectZone,
  onSelectDoor,
}) {
  const uid = useId().replace(/:/g, '')
  const id = (name) => `${name}-${uid}`

  const z1 = zones?.[1] ?? { hex: '#ff8a3d', brightness: 5 }
  const z2 = zones?.[2] ?? { hex: '#ff8a3d', brightness: 5 }

  // Brightness 0-9 maps to opacity. Power off leaves faint outlines only.
  const op = (b) => (power ? 0.15 + 0.85 * (Math.max(0, Math.min(9, b)) / 9) : 0.08)
  const o1 = op(z1.brightness)
  const o2 = op(z2.brightness)

  const byZone = useMemo(
    () => ({ 1: PIECES.filter((p) => p.zone === 1), 2: PIECES.filter((p) => p.zone === 2) }),
    [],
  )

  // The car draws itself once per launch — but not until the intro overlay
  // has released the gate, so the SVG tracer starts while the video's last
  // flare is still on screen. Default-open means reduced-motion (no overlay)
  // still traces immediately.
  const gate = useLaunchStore((s) => s.gate)
  const [intro, setIntro] = useState(false)

  useEffect(() => {
    if (gate === 'held') return undefined
    setIntro(true)
    const timer = setTimeout(() => setIntro(false), DRAW_MS)
    return () => clearTimeout(timer)
  }, [gate])

  // Connecting is the rarest event in the app, so it gets the biggest moment:
  // a single light sweep down the length of the car.
  const status = useConnectionStore((s) => s.status)
  const prevStatus = useRef(status)
  const [sweep, setSweep] = useState(0)

  useEffect(() => {
    if (status === 'connected' && prevStatus.current !== 'connected') {
      setSweep((n) => n + 1)
    }
    prevStatus.current = status
  }, [status])

  const wash = power ? (selectedZone === 2 ? z2.hex : z1.hex) : 'transparent'

  const select = (zone, doorId) => {
    haptics.tick()
    onSelectZone?.(zone)
    if (doorId) onSelectDoor?.(doorId)
  }

  return (
    <div className={`carhero${intro ? ' is-intro' : ''}`}>
      {/* Pool of light the car sits in. Softness comes from wide gradient
          stops rather than a blur filter — same look, far cheaper. */}
      <div
        className="carhero-wash"
        aria-hidden="true"
        style={{ '--wash': wash, opacity: power ? 0.5 + 0.5 * (z1.brightness / 9) : 0 }}
      />

      <svg
        className="carhero-svg"
        viewBox={CAR_VIEWBOX}
        role="group"
        aria-label="Cabin light map. Tap a part of the car to select its zone."
      >
        <defs>
          <filter id={id('glow1')} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={id('glow2')} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Metallic body: light along the flanks, dark at nose and tail */}
          <linearGradient id={id('body')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0c10" />
            <stop offset="28%" stopColor="#14181f" />
            <stop offset="50%" stopColor="#181c24" />
            <stop offset="72%" stopColor="#12151b" />
            <stop offset="100%" stopColor="#0a0c10" />
          </linearGradient>

          {/* Rim catches more light at the nose, like a real body crease */}
          <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
            <stop offset="45%" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>

          <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.07)" />
            <stop offset="30%" stopColor="rgba(255,255,255,0)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.03)" />
          </linearGradient>

          <linearGradient id={id('glass')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(160,190,230,0.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </linearGradient>

          {/* Darker than black is impossible on OLED, so the "shadow" under the
              car is a faint cool light pool that grounds it instead. */}
          <radialGradient id={id('floor')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(140,160,200,0.05)" />
            <stop offset="45%" stopColor="rgba(140,160,200,0.02)" />
            <stop offset="72%" stopColor="rgba(140,160,200,0)" />
          </radialGradient>

          <linearGradient id={id('sweep')} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.30)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          <clipPath id={id('clip')}>
            <path d={BODY_D} />
          </clipPath>
        </defs>

        {/* ---- showroom floor ---- */}
        <ellipse
          className="carhero-floor"
          cx="210"
          cy="354"
          rx="196"
          ry="344"
          fill={`url(#${id('floor')})`}
          aria-hidden="true"
        />

        {/* ---- body shell ---- */}
        <path
          className="chrome-shell"
          d={BODY_D}
          fill={`url(#${id('body')})`}
          stroke={`url(#${id('rim')})`}
          strokeWidth="2"
          aria-hidden="true"
        />

        {/* ---- interior ---- */}
        <g className="carhero-chrome" aria-hidden="true">
          {CABIN_CHROME.filter((s) => s.id !== 'body').map((s) => (
            <Chrome key={s.id} shape={s} glassFill={`url(#${id('glass')})`} />
          ))}
          <path d={BODY_D} fill={`url(#${id('sheen')})`} pointerEvents="none" />
        </g>

        {/* ---- door labels ---- */}
        <g className="carhero-doorlabels" aria-hidden="true">
          {DOORS.map((d) => (
            <text key={d.id} x={d.labelAt.x} y={d.labelAt.y} textAnchor="middle">
              {d.short}
            </text>
          ))}
        </g>

        {/* ---- first-run outline tracer ---- */}
        {intro ? (
          <path
            className="carhero-outline"
            d={BODY_D}
            pathLength="100"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2"
            aria-hidden="true"
            onAnimationEnd={() => setIntro(false)}
          />
        ) : null}

        {/* ---- Zone 1: front cabin — ONE filter for all 12 pieces ---- */}
        <g
          filter={power ? `url(#${id('glow1')})` : undefined}
          opacity={o1}
          className={
            'carhero-zone' +
            (selectedZone === 1 || selectedZone === 3 ? ' is-selected' : '') +
            (activeMode ? ' is-animating' : '')
          }
        >
          {byZone[1].map((p) => (
            <Lit key={p.id} piece={p} color={z1.hex} />
          ))}
        </g>

        {/* ---- Zone 2: handles & feet — ONE filter for all 7 pieces ---- */}
        <g
          filter={power ? `url(#${id('glow2')})` : undefined}
          opacity={o2}
          className={
            'carhero-zone' +
            (selectedZone === 2 || selectedZone === 3 ? ' is-selected' : '') +
            (activeMode ? ' is-animating' : '')
          }
        >
          {byZone[2].map((p) => (
            <Lit key={p.id} piece={p} color={z2.hex} />
          ))}
        </g>

        {/* ---- connect sweep ---- */}
        {sweep > 0 ? (
          <g clipPath={`url(#${id('clip')})`} aria-hidden="true">
            <rect
              key={sweep}
              className="carhero-sweep"
              x="-170"
              y="0"
              width="170"
              height="700"
              fill={`url(#${id('sweep')})`}
            />
          </g>
        ) : null}

        {/* ---- hit targets: transparent, fattened, focusable ---- */}
        <g className="carhero-hits">
          {PIECES.map((p) => (
            <Hit
              key={p.id}
              piece={p}
              selected={selectedZone === p.zone}
              onSelect={() => select(p.zone, p.door)}
            />
          ))}
        </g>
      </svg>

      {activeMode ? (
        <p className="carhero-mode" role="status">
          <span className="carhero-mode-dot" aria-hidden="true" />
          Running {activeMode.name}
        </p>
      ) : null}

      <p className="carhero-caption">{ZONE_CAPTION[selectedZone] ?? ZONE_CAPTION[3]}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Chrome({ shape, glassFill }) {
  const cls = `chrome-${shape.role}`
  const fill = shape.role === 'glass' ? glassFill : undefined

  if (shape.type === 'rect') {
    return (
      <rect
        className={cls}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx}
      />
    )
  }
  if (shape.type === 'ellipse') {
    return <ellipse className={cls} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
  }
  return <path className={cls} d={shape.d} fill={fill} />
}

function Lit({ piece, color }) {
  if (piece.kind === 'ring') {
    return (
      <circle
        cx={piece.cx}
        cy={piece.cy}
        r={piece.r}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        className="lit"
      />
    )
  }
  if (piece.kind === 'ellipse') {
    return (
      <ellipse
        cx={piece.cx}
        cy={piece.cy}
        rx={piece.rx}
        ry={piece.ry}
        fill={color}
        fillOpacity={0.45}
        stroke={color}
        strokeWidth={2.5}
        className="lit"
      />
    )
  }
  return (
    <path
      d={piece.d}
      fill="none"
      stroke={color}
      strokeWidth={piece.w ?? 5}
      strokeLinecap="round"
      className="lit"
    />
  )
}

/** Invisible, generously fattened tap/focus target for one piece. */
function Hit({ piece, selected, onSelect }) {
  const label = `${piece.label}, ${piece.zone === 1 ? 'Front cabin' : 'Handles and feet'} zone`
  const common = {
    className: 'carhero-hit',
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-pressed': selected,
    onClick: onSelect,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect()
      }
    },
  }

  if (piece.kind === 'ring') {
    return <circle {...common} cx={piece.cx} cy={piece.cy} r={(piece.r ?? 9) + 16} />
  }
  if (piece.kind === 'ellipse') {
    return (
      <ellipse {...common} cx={piece.cx} cy={piece.cy} rx={(piece.rx ?? 20) + 12} ry={(piece.ry ?? 12) + 14} />
    )
  }
  return <path {...common} d={piece.d} strokeWidth={40} strokeLinecap="round" fill="none" />
}
