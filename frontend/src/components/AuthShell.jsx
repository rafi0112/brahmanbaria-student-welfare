import { useApp } from '../lib/app.jsx'

const CROP = { login: '0% 50%', register: '84% 50%', plain: '100% 50%' }

// The shared frame of every account page: a crop of the heritage artwork beside a quiet form panel.
// The image is decoration only; on phones it shrinks to a short banner above the form.
export default function AuthShell({ variant = 'plain', wide = false, children }) {
  const { t, pick } = useApp()
  const line = variant === 'register' ? t('hero.script') : pick('তিতাসের তীরে ঈমানের আলো, ব্রাহ্মণবাড়িয়া', 'By the Titas, the light of faith: Brahmanbaria')
  return (
    <section className={`auth auth-${variant}${wide ? ' auth-wide' : ''}`}>
      <aside className="auth-visual" aria-hidden="true">
        <img src="/images/hero-art-1774.webp" srcSet="/images/hero-art-1000.webp 1000w, /images/hero-art-1774.webp 1774w" sizes="(min-width: 960px) 46vw, 100vw" width="1774" height="512" alt="" style={{ objectPosition: CROP[variant] || CROP.plain }} />
        <div className="auth-visual-copy">
          <p className="eyebrow">{t('brand')} · {t('brandSub')}</p>
          <p className="auth-line">{line}</p>
        </div>
      </aside>
      <div className="auth-panel">{children}</div>
    </section>
  )
}
