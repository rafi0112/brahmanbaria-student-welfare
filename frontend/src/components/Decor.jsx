// Decorative pieces of the BSWA look: the round seal, botanical sprigs that overlap image edges, and sketch line-art behind
// sections. Everything here is presentational and hidden from assistive technology.

// The association's round seal, used wherever the mark appears (header, footer, sign-in pages). The file is cut to the
// circle, so it sits cleanly on light and dark surfaces.
export function LeafMark({ size = 38, className = '' }) {
  return <img className={`leafmark ${className}`} src="/logo-96.webp" srcSet="/logo-96.webp 96w, /logo-256.webp 256w" sizes={`${size}px`} width={size} height={size} alt="" decoding="async" />
}

// A botanical sprig from /public/art, placed by its class (see .sprig-* in styles.css).
export function Sprig({ src = 'sprig', className = '' }) {
  return <img className={`sprig ${className}`} src={`/art/${src}.webp`} alt="" aria-hidden="true" loading="lazy" decoding="async" />
}

// A pencil sketch from /public/art used as quiet background line-art.
export function SketchArt({ src, className = '' }) {
  return <img className={`sketch-art ${className}`} src={`/art/${src}.webp`} alt="" aria-hidden="true" loading="lazy" decoding="async" />
}

// The thin sage vine with small leaves that edges the mockup's photographs.
export function Vine({ className = '', flip = false }) {
  const leaves = [[18, 92, -40], [26, 78, 30], [30, 64, -35], [40, 52, 25], [44, 38, -30], [56, 30, 20], [62, 18, -25], [74, 12, 15]]
  return (
    <svg className={`vine ${className}`} viewBox="0 0 100 110" aria-hidden="true" focusable="false" style={flip ? { transform: 'scale(-1, -1)' } : undefined}>
      <path d="M8 108C14 92 22 84 28 70S38 50 46 40 60 22 82 6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {leaves.map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="7" ry="3.2" transform={`rotate(${r} ${x} ${y}) translate(${r < 0 ? -5 : 5} 0)`} fill="currentColor" opacity={i % 3 === 0 ? 0.55 : 0.85} />
      ))}
      <circle cx="84" cy="5" r="1.6" fill="#E94F20" opacity=".7" />
      <circle cx="20" cy="99" r="1.3" fill="#E94F20" opacity=".55" />
    </svg>
  )
}
