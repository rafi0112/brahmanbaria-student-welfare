import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { strings, bnDigits } from '../data/strings.js'
import { api } from './api.js'

const Ctx = createContext(null)
const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage may be blocked */ } }

// The wording admins changed from the panel ({ key: { bn, en } }), fetched once per visit. Until it arrives, and for
// every text nobody changed, the built-in wording shows. The last copy is kept so a return visit starts with it.
const TEXTS_KEY = 'jk-texts'
let textCache = (() => { try { return JSON.parse(read(TEXTS_KEY) || '{}') || {} } catch { return {} } })()
const textListeners = new Set()
export function setSiteTexts(tx) {
  textCache = tx && typeof tx === 'object' ? tx : {}
  write(TEXTS_KEY, JSON.stringify(textCache))
  textListeners.forEach((f) => f(textCache))
}
export const reloadSiteTexts = () => api('/site-texts').then((d) => setSiteTexts(d.texts)).catch(() => { /* keep the built-in wording */ })

export function AppProvider({ children }) {
  const [lang, setLang] = useState(() => read('jk-lang') || 'bn')
  const [theme, setTheme] = useState(() => read('jk-theme') || '')
  const [texts, setTexts] = useState(textCache)
  useEffect(() => {
    textListeners.add(setTexts)
    reloadSiteTexts()
    return () => textListeners.delete(setTexts)
  }, [])

  useEffect(() => { document.documentElement.lang = lang }, [lang])
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [theme])

  const isDark = () => (theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
  const toggleTheme = useCallback(() => {
    const next = isDark() ? 'light' : 'dark'
    setTheme(next); write('jk-theme', next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
  const toggleLang = useCallback(() => {
    const next = lang === 'bn' ? 'en' : 'bn'
    setLang(next); write('jk-lang', next)
  }, [lang])

  const value = useMemo(() => {
    const dict = strings[lang]
    return {
      lang, theme, toggleLang, toggleTheme, isDark,
      t: (k) => texts[k]?.[lang] || dict[k] || texts[k]?.[lang === 'bn' ? 'en' : 'bn'] || strings.en[k] || k,
      n: (v) => (lang === 'bn' ? bnDigits(v) : String(v)),
      // the other language is used when the chosen one is empty, so single-language content still shows
      pick: (bn, en) => {
        const [mine, other] = lang === 'bn' ? [bn, en] : [en, bn]
        const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
        return empty(mine) ? other : mine
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, theme, texts, toggleLang, toggleTheme])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => useContext(Ctx)
