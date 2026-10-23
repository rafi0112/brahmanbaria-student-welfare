// Decorative pieces of the BSWA look: the leaf mark, botanical sprigs that overlap image edges, and sketch line-art behind
// sections. Everything here is presentational and hidden from assistive technology.

export function LeafMark({ size = 38, className = '' }) {
  return (
    <svg className={`leafmark ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M24 44C17 37 15 26 19 17c2-5 4-9 5-13 1 4 3 8 5 13 4 9 2 20-5 27z" fill="#E94F20" />
      <path d="M22 44C13 43 6 37 4 28c-.5-3 0-6 1-8 3 2 7 3 10 6 5 5 7 12 7 18z" fill="#0B5E4C" />
      <path d="M26 44c9-1 16-7 18-16 .5-3 0-6-1-8-3 2-7 3-10 6-5 5-7 12-7 18z" fill="#0B5E4C" />
      <path d="M24 44V18" stroke="#FFF5E9" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}

// A botanical sprig from /public/art, placed by its class (see .sprig-* in styles.css).
export function Sprig({ src = 'sprig', className = '' }) {
  return <img className={`sprig ${className}`} src={`/art/${src}.webp`} alt="" aria-hidden="true" loading="lazy" decoding="async" />
}

// A pencil sketch from /public/art used as quiet background line-art.
export function SketchArt({ src, className = '' }) {
  return <img className={`sketch-art ${className}`} src={`/art/${src}.webp`} alt="" aria-hidden="true" loading="lazy" decoding="async" />
}
