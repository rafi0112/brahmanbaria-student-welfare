// Hand-drawn style line art. Strokes use currentColor and the #rough filter from index.html
// so edges wobble very slightly.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', filter: 'url(#rough)' }

export function Logo({ size = 40 }) {
  return <img src="/logo-96.webp" srcSet="/logo-96.webp 1x, /logo-256.webp 2x" width={size} height={size} alt="" className="logo-img" />
}

export function Leaves({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 160 220" aria-hidden="true" {...base}>
      <path d="M80 214C78 160 82 100 96 22" />
      <path d="M86 150c-22-6-38-22-42-44 24 2 40 16 42 44z" />
      <path d="M88 118c20-8 34-24 36-46-22 4-36 18-36 46z" />
      <path d="M92 84c-18-6-30-20-32-38 20 2 32 14 32 38z" />
      <path d="M96 58c14-8 22-20 22-36-16 4-24 16-22 36z" />
      <path d="M82 190c-18 0-32-10-38-24 18-2 32 6 38 24z" />
    </svg>
  )
}

export function Monument({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 360 200" aria-hidden="true" {...base}>
      <path d="M20 184h320" />
      <path d="M60 184V104h240v80" />
      <path d="M60 104c0-26 14-34 30-34h180c16 0 30 8 30 34" />
      <path d="M142 104c0-30 16-52 38-52s38 22 38 52" />
      <path d="M180 52V28M174 34h12" />
      <path d="M160 184v-44c0-12 9-20 20-20s20 8 20 20v44" />
      <path d="M84 184v-34c0-8 6-14 13-14s13 6 13 14v34M250 184v-34c0-8 6-14 13-14s13 6 13 14v34" />
      <path d="M44 184V92M316 184V92" />
      <path d="M38 92h12M310 92h12M44 92c0-12 6-22 0-30M316 92c0-12 6-22 0-30" />
      <path d="M96 104v12M264 104v12M130 104v12M230 104v12" />
    </svg>
  )
}

export function Students({ className = '' }) {
  const person = (x, hair) => (
    <g key={x} transform={`translate(${x} 0)`}>
      <circle cx="40" cy="38" r="14" />
      <path d={hair} />
      <path d="M18 120c0-26 8-50 22-50s22 24 22 50" />
      <path d="M22 84c-8 6-10 18-8 30M58 84c8 6 10 18 8 30" />
      <path d="M26 120v54M54 120v54" />
      <path d="M62 84c8 2 12 12 12 26v18h-12z" />
    </g>
  )
  return (
    <svg className={className} viewBox="0 0 320 190" aria-hidden="true" {...base}>
      {person(10, 'M26 34c2-12 22-16 28-2')}
      {person(110, 'M24 40c0-16 30-18 32 0M26 52c-6 6-6 14-4 22')}
      {person(210, 'M26 32c4-10 22-14 28 0')}
      <path d="M0 176h320" />
    </svg>
  )
}

export function Plane({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 120 80" aria-hidden="true" {...base}>
      <path d="M6 38 112 8 80 72 58 48 6 38zM58 48 112 8M58 48l-4 20 14-14" />
      <path d="M2 64c14 6 24-4 36-2" strokeDasharray="3 6" />
    </svg>
  )
}

export function Waves({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 400 60" aria-hidden="true" {...base}>
      <path d="M0 14c25-12 50 12 75 0s50 12 75 0 50 12 75 0 50 12 75 0 50 12 75 0" />
      <path d="M0 34c25-12 50 12 75 0s50 12 75 0 50 12 75 0 50 12 75 0 50 12 75 0" />
      <path d="M0 54c25-12 50 12 75 0s50 12 75 0 50 12 75 0 50 12 75 0 50 12 75 0" />
    </svg>
  )
}

// Soft curved divider that carries one section's background into the next.
export function Wave({ from = 'var(--paper)', flip = false }) {
  return (
    <svg className={`wave ${flip ? 'wave-flip' : ''}`} viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
      <path fill={from} d="M0 90V38C180 8 340 4 520 26c200 24 330 48 520 30 150-14 270-40 400-44V90z" />
    </svg>
  )
}
