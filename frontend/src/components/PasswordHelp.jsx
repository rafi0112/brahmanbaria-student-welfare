import { useState } from 'react'
import { useApp } from '../lib/app.jsx'
import { checkPassword, suggestPassword } from '../lib/password.js'

const LEVEL = ['', 'weak', 'fair', 'good', 'strong']

// Under a new-password field: a four-step meter, what is still missing, and a strong suggestion the person can use.
// onSuggest(password) fills the password and its confirmation.
export default function PasswordHelp({ value, who, onSuggest, id }) {
  const { t } = useApp()
  const [suggested, setSuggested] = useState('')
  const [copied, setCopied] = useState(false)
  const { rules, score } = checkPassword(value, who)
  const suggest = () => {
    const pw = suggestPassword()
    setSuggested(pw); setCopied(false)
    onSuggest(pw)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(suggested); setCopied(true) } catch { setCopied(false) }
  }
  return (
    <div className="pwh" id={id}>
      <div className={`pwh-meter is-${LEVEL[score] || 'empty'}`} aria-hidden="true">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= score ? 'on' : ''} />)}</div>
      <p className="pwh-level" aria-live="polite">
        {value ? <>{t('pw.strength')}: <b>{t(`pw.level.${LEVEL[score]}`)}</b></> : t('pw.intro')}
      </p>
      <ul className="pwh-rules">
        {rules.map((r) => (
          <li key={r.id} className={r.ok ? 'ok' : ''}>
            <span className="pwh-dot" aria-hidden="true">{r.ok ? '✓' : ''}</span>
            {t(`pw.rule.${r.id}`)}<span className="sr-only"> {t(r.ok ? 'pw.met' : 'pw.notMet')}</span>
          </li>
        ))}
      </ul>
      <div className="pwh-suggest">
        <button type="button" className="btn btn-outline btn-sm" onClick={suggest}>{t(suggested ? 'pw.another' : 'pw.suggest')}</button>
        {suggested && value === suggested && (
          <>
            <code className="pwh-code">{suggested}</code>
            <button type="button" className="btn btn-quiet btn-sm" onClick={copy}>{t(copied ? 'pw.copied' : 'pw.copy')}</button>
          </>
        )}
      </div>
      {suggested && value === suggested && <p className="pwh-note">{t('pw.saveIt')}</p>}
    </div>
  )
}

// Live feedback for the "confirm password" field.
export function ConfirmHint({ password, confirm }) {
  const { t } = useApp()
  if (!confirm) return null
  const same = password === confirm
  return <small className={same ? 'pwh-match ok' : 'pwh-match'} aria-live="polite">{t(same ? 'pw.match' : 'pw.noMatch')}</small>
}
