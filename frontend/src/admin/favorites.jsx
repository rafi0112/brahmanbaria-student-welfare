import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { addFolder, addLink, deleteFolder, emptyState, findLink, moveLink, moveTop, parseState, removeLink, renameFolder, renameLink, setGroup, shift, storageKey, toggleFolder } from '../lib/favorites.js'

const Ctx = createContext(null)
export const useFavorites = () => useContext(Ctx)

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* a blocked store only loses the preference */ } }

// Favorites are personal layout preferences kept in this browser, per admin. They are never used for permissions or records.
export function FavoritesProvider({ userId, children }) {
  const key = storageKey(userId)
  const [state, setStateRaw] = useState(() => parseState(read(key)))
  const ref = useRef(state)
  ref.current = state
  const setState = useCallback((next) => { ref.current = next; setStateRaw(next) }, [])
  useEffect(() => { write(key, JSON.stringify(state)) }, [key, state])
  useEffect(() => {
    const onStorage = (e) => { if (e.key === key) setStateRaw(parseState(e.newValue)) } // another tab changed them
    addEventListener('storage', onStorage)
    return () => removeEventListener('storage', onStorage)
  }, [key])

  const api = useMemo(() => {
    // each action reads the freshest state, applies a pure function and reports whether it worked
    const run = (fn) => { const r = fn(ref.current); if (r.ok) setState(r.state); return r }
    return {
      state,
      empty: () => setState(emptyState()),
      isFav: (to) => findLink(ref.current, to),
      add: (label, to, folderId) => run((s) => addLink(s, { label, to }, folderId)),
      remove: (id) => setState(removeLink(ref.current, id)),
      renameLink: (id, label) => run((s) => renameLink(s, id, label)),
      addFolder: (name) => run((s) => addFolder(s, name)),
      renameFolder: (id, name) => run((s) => renameFolder(s, id, name)),
      deleteFolder: (id) => setState(deleteFolder(ref.current, id)),
      toggleFolder: (id, open) => setState(toggleFolder(ref.current, id, open)),
      setGroup: (id, open) => setState(setGroup(ref.current, id, open)),
      moveLink: (id, to) => setState(moveLink(ref.current, id, to)),
      moveTop: (id, before) => setState(moveTop(ref.current, id, before)),
      shift: (id, delta) => setState(shift(ref.current, id, delta)),
    }
  }, [state, setState])
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
