import { useMemo, useRef, useState } from 'react'
import map from '../data/map.json'
import { useApp } from '../lib/app.jsx'

const project = (lat, lng) => {
  const { minx, maxy, k, s } = map.proj
  return [(lng - minx) * k * s, (maxy - lat) * s]
}

const shortName = (u, pick) => {
  const en = u.nameEn.replace(' Upazila', '').replace('Brahmanbaria ', '')
  const bn = u.nameBn.replace(' উপজেলা', '').replace('ব্রাহ্মণবাড়িয়া ', '')
  return pick(bn, en)
}

// Interactive SVG map of the nine upazilas (real boundaries, no tile server needed).
export default function UpazilaMap({ upazilas = [], places = [], selected, onSelect, onPin, showPins = true }) {
  const { t, n, pick } = useApp()
  const [hover, setHover] = useState(null)
  const refs = useRef({})
  const byslug = useMemo(() => Object.fromEntries(upazilas.map((u) => [u.slug, u])), [upazilas])
  const max = Math.max(1, ...upazilas.map((u) => u.members || 0))
  const slugs = Object.keys(map.upazilas)

  // Arrow keys jump to the nearest upazila in that direction.
  const move = (from, dx, dy) => {
    const a = map.upazilas[from]
    let best = null, bd = Infinity
    slugs.forEach((s) => {
      if (s === from) return
      const b = map.upazilas[s]
      const vx = b.cx - a.cx, vy = b.cy - a.cy
      if (vx * dx + vy * dy <= 0) return
      const d = Math.hypot(vx, vy) + Math.abs(vx * dy - vy * dx) * 0.6
      if (d < bd) { bd = d; best = s }
    })
    if (best) refs.current[best]?.focus()
  }
  const onKey = (e, slug) => {
    const dir = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (dir) { e.preventDefault(); move(slug, ...dir) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(slug) }
  }

  const hov = hover && byslug[hover]
  return (
    <div className="map-card">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} role="group" aria-label={t('dir.title')} className="upmap">
        <g>
          {slugs.map((slug) => {
            const u = byslug[slug]
            const d = map.upazilas[slug]
            const density = u ? Math.round(14 + ((u.members || 0) / max) * 46) : 14
            const on = selected === slug
            return (
              <path
                key={slug}
                d={d.d}
                ref={(el) => { refs.current[slug] = el }}
                className={`up-shape ${on ? 'on' : ''}`}
                style={{ fill: on ? undefined : `color-mix(in srgb, var(--leaf) ${density}%, var(--paper-2))` }}
                tabIndex={0}
                role="button"
                aria-pressed={on}
                aria-label={u ? `${shortName(u, pick)}, ${n(u.members)} ${t('dir.members')}` : slug}
                onClick={() => onSelect?.(slug)}
                onKeyDown={(e) => onKey(e, slug)}
                onMouseEnter={() => setHover(slug)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(slug)}
                onBlur={() => setHover(null)}
              />
            )
          })}
        </g>
        <g className="up-labels" aria-hidden="true">
          {slugs.map((slug) => {
            const u = byslug[slug]; const d = map.upazilas[slug]
            return u ? <text key={slug} x={d.cx} y={d.cy} className={selected === slug ? 'on' : ''}>{shortName(u, pick)}</text> : null
          })}
        </g>
        {showPins && (
          <g className="up-pins">
            {places.filter((p) => p.lat != null).map((p) => {
              const [x, y] = project(p.lat, p.lng)
              return (
                <g key={p.slug} transform={`translate(${x} ${y})`} role="link" tabIndex={0} aria-label={pick(p.nameBn, p.nameEn)}
                   onClick={() => onPin?.(p)} onKeyDown={(e) => (e.key === 'Enter' ? onPin?.(p) : null)}>
                  <circle r="16" className="pin-halo" />
                  <path d="M0 0c-9-10-12-16-12-22a12 12 0 0 1 24 0c0 6-3 12-12 22z" transform="translate(0 6) scale(.8)" className="pin" />
                  <circle cy="-11" r="3.4" className="pin-dot" />
                  <title>{pick(p.nameBn, p.nameEn)}</title>
                </g>
              )
            })}
          </g>
        )}
      </svg>
      <div className="map-tip" aria-hidden={!hov}>
        {hov ? <><strong>{shortName(hov, pick)}</strong><span>{n(hov.members)} {t('dir.members')} · {n(hov.unions.length)} {t('dir.unions')}</span></> : <span>{t('dir.hint')}</span>}
      </div>
      <p className="map-attrib">{t('dir.mapNote')}</p>
    </div>
  )
}
