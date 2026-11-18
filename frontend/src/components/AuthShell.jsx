// The shared frame of every account page: the form, centred on a quiet page (no picture beside it).
export default function AuthShell({ variant = 'plain', wide = false, children }) {
  return (
    <section className={`auth auth-${variant}${wide ? ' auth-wide' : ''}`}>
      <div className="auth-panel">{children}</div>
    </section>
  )
}
