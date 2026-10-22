import { useEffect, useRef } from 'react'

// Fades and lifts its content in once, the first time it scrolls into view. Content is never hidden without JavaScript
// (the hidden start state only applies under html.js), and reduced-motion users get it immediately (see styles.css).
export default function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (typeof IntersectionObserver === 'undefined') { el.classList.add('is-in'); return undefined }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <Tag ref={ref} data-reveal="" className={className} style={delay ? { '--reveal-delay': `${delay}ms` } : undefined} {...rest}>{children}</Tag>
}
