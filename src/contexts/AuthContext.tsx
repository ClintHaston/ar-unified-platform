import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type User } from '../lib/api'

interface AuthState {
  user: User | null
  permissions: Record<string, boolean>
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

interface AuthData {
  user: User | null
  permissions: Record<string, boolean>
  loading: boolean
}

const AuthContext = createContext<AuthState | null>(null)

function readStoredUser(): User | null {
  try {
    const stored = localStorage.getItem('ar_user')
    return stored ? (JSON.parse(stored) as User) : null
  } catch {
    localStorage.removeItem('ar_user')
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ user, permissions, loading }, setAuthData] = useState<AuthData>(() => ({
    user: readStoredUser(),
    permissions: {},
    loading: true,
  }))

  useEffect(() => {
    let cancelled = false
    const token = localStorage.getItem('ar_token')

    if (!token) {
      localStorage.removeItem('ar_user')
      setAuthData({ user: null, permissions: {}, loading: false })
      return () => { cancelled = true }
    }

    Promise.all([api.me(), api.permissionsMe()])
      .then(([me, perms]) => {
        if (cancelled) return
        localStorage.setItem('ar_user', JSON.stringify(me))
        setAuthData({ user: me, permissions: perms.permissions, loading: false })
      })
      .catch(() => {
        if (cancelled) return
        localStorage.removeItem('ar_token')
        localStorage.removeItem('ar_user')
        setAuthData({ user: null, permissions: {}, loading: false })
      })

    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password)
    localStorage.setItem('ar_token', res.token)
    const perms = await api.permissionsMe()
    localStorage.setItem('ar_user', JSON.stringify(res.user))
    setAuthData({ user: res.user, permissions: perms.permissions, loading: false })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('ar_token')
    localStorage.removeItem('ar_user')
    setAuthData({ user: null, permissions: {}, loading: false })
  }, [])

  const value = useMemo(
    () => ({ user, permissions, loading, login, logout }),
    [user, permissions, loading, login, logout]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
