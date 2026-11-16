import { useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

// "?profile=<id>" decides which profile is open over the Students or Alumni list. Opening adds a history entry, so the
// browser's Back button closes it; a link someone shares opens it directly, and closing it then just drops the parameter.
export function useProfileParam() {
  const [sp, setSp] = useSearchParams()
  const navigate = useNavigate()
  const pushed = useRef(false)
  const id = sp.get('profile') || ''
  const open = useCallback((next) => {
    const p = new URLSearchParams(sp)
    p.set('profile', String(next))
    pushed.current = true
    setSp(p)
  }, [sp, setSp])
  const close = useCallback(() => {
    if (pushed.current) { pushed.current = false; navigate(-1); return }
    const p = new URLSearchParams(sp)
    p.delete('profile')
    setSp(p, { replace: true })
  }, [sp, setSp, navigate])
  return [id, open, close]
}
