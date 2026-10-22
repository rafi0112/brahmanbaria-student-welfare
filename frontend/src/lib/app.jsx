import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { strings, bnDigits } from '../data/strings.js'

const Ctx = createContext(null)
const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage may be blocked */ } }

export function AppProvider({ children }) {
  const [lang, setLang] = useState(() => read('jk-lang') || 'bn')
  const [theme, setTheme] = useState(() => read('jk-theme') || '')

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
      t: (k) => dict[k] ?? strings.en[k] ?? k,
      n: (v) => (lang === 'bn' ? bnDigits(v) : String(v)),
      // the other language is used when the chosen one is empty, so single-language content still shows
      pick: (bn, en) => {
        const [mine, other] = lang === 'bn' ? [bn, en] : [en, bn]
        const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
        return empty(mine) ? other : mine
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, theme, toggleLang, toggleTheme])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useApp = () => useContext(Ctx)
