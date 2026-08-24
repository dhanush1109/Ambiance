import { BODY_D, PIECES } from '../data/pieces'

/**
 * A tiny, static version of the cabin map for mood and preview cards.
 *
 * Deliberately stripped: no glow filters, no interior detail, no labels, no
 * focusable nodes. It is decoration beside a name that already says what the
 * mood is, so it stays out of the accessibility tree entirely — which also
 * keeps it from colliding with the real map's labelled hit regions.
 *
 * Rotated a quarter turn so the car lies nose-right and fills a wide swatch,
 * and drawn with much heavier strokes so the pieces survive the ~0.13 scale.
 */

const STROKE_SCALE = 3

export default function MiniCar({ z1, z2, b1 = 7, b2 = 5, className = '' }) {
  const op = (b) => 0.35 + 0.65 * (Math.max(0, Math.min(9, b)) / 9)

  return (
    <svg
      viewBox="0 0 700 420"
      className={`minicar ${className}`}
      data-minicar=""
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(700 0) rotate(90)">
        <path d={BODY_D} fill="#0b0d12" stroke="rgba(255,255,255,0.10)" strokeWidth="2" />

        <g opacity={op(b1)}>
          {PIECES.filter((p) => p.zone === 1).map((p) => (
            <Piece key={p.id} piece={p} color={z1} />
          ))}
        </g>
        <g opacity={op(b2)}>
          {PIECES.filter((p) => p.zone === 2).map((p) => (
            <Piece key={p.id} piece={p} color={z2} />
          ))}
        </g>
      </g>
    </svg>
  )
}

function Piece({ piece, color }) {
  if (piece.kind === 'ring') {
    return (
      <circle
        className="mini-lit"
        cx={piece.cx}
        cy={piece.cy}
        r={(piece.r ?? 9) * 2}
        fill="none"
        stroke={color}
        strokeWidth={6}
      />
    )
  }
  if (piece.kind === 'ellipse') {
    return (
      <ellipse
        className="mini-lit"
        cx={piece.cx}
        cy={piece.cy}
        rx={(piece.rx ?? 20) * 1.5}
        ry={(piece.ry ?? 12) * 1.5}
        fill={color}
        fillOpacity={0.5}
      />
    )
  }
  return (
    <path
      className="mini-lit"
      d={piece.d}
      fill="none"
      stroke={color}
      strokeWidth={(piece.w ?? 5) * STROKE_SCALE}
      strokeLinecap="round"
    />
  )
}
