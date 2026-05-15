import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type User } from '../lib/api'

interface AuthState {
  user: User | null
  permissions: Record<string, boolean>
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('ar_user')
    return stored ? (JSON.parse(stored) as User) : null
  })
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ar_token')
    if (!token) {
      setLoading(false)
      return
    }

    Promise.all([api.me(), api.permissionsMe()])
      .then(([me, perms]) => {
        setUser(me)
        localStorage.setItem('ar_user', JSON.stringify(me))
        setPermissions(perms.permissions)
      })
      .catch(() => {
        localStorage.removeItem('ar_token')
        localStorage.removeItem('ar_user')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(email: string, password: string) {
    const res = await api.login(email, password)
    localStorage.setItem('ar_token', res.token)
    localStorage.setItem('ar_user', JSON.stringify(res.user))
    setUser(res.user)
    const perms = await api.permissionsMe()
    setPermissions(perms.permissions)
  }

  function logout() {
    localStorage.removeItem('ar_token')
    localStorage.removeItem('ar_user')
    setUser(null)
    setPermissions({})
  }

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
