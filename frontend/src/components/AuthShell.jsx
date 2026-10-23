import { useApp } from '../lib/app.jsx'

const ART = { login: ['mosque', '50% 40%', 530, 500], register: ['baul', '50% 30%', 382, 400], plain: ['river', '50% 50%', 740, 421] }

// The shared frame of every account page: a crop of the heritage artwork beside a quiet form panel.
// The image is decoration only; on phones it shrinks to a short banner above the form.
export default function AuthShell({ variant = 'plain', wide = false, children }) {
  const { t, pick } = useApp()
  const line = variant === 'register' ? t('hero.script') : pick('তিতাসের তীরে ঈমানের আলো, ব্রাহ্মণবাড়িয়া', 'By the Titas, the light of faith: Brahmanbaria')
  return (
    <section className={`auth auth-${variant}${wide ? ' auth-wide' : ''}`}>
      <aside className="auth-visual" aria-hidden="true">
        <img src={`/images/bswa/${(ART[variant] || ART.plain)[0]}.webp`} width={(ART[variant] || ART.plain)[2]} height={(ART[variant] || ART.plain)[3]} alt="" style={{ objectPosition: (ART[variant] || ART.plain)[1] }} />
        <div className="auth-visual-copy">
          <p className="eyebrow">{t('brand')} · {t('brandSub')}</p>
          <p className="auth-line">{line}</p>
        </div>
      </aside>
      <div className="auth-panel">{children}</div>
    </section>
  )
}
