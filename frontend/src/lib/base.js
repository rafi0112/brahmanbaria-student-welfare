import { createContext, useContext } from 'react'

// Where the page is mounted: '' on the public site, '/admin' when shown inside the admin panel,
// so links between students, places and posts keep the admin sidebar on screen.
const BaseCtx = createContext('')
export const BaseProvider = BaseCtx.Provider
export const useBase = () => useContext(BaseCtx)
