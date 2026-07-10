// Unified-platform API client — §2 auth per Amendment 10.
// The access token lives ONLY in this module's memory; the refresh token is
// an httpOnly cookie the JS never sees. On 401 we silently refresh once and
// retry. All calls go through the Vercel /api proxy in prod, so the cookie
// is first-party.

const BASE = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

let accessToken: string | null = null

export interface User {
  id: string
  email: string
  name: string
  role: 'rep' | 'admin' | string
  must_change_password: boolean
}

export interface AuthResponse {
  access_token: string
  user: User
}

function setAccessToken(token: string | null): void {
  accessToken = token
}

async function rawRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  return fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const res = await rawRequest(path, options)

  if (res.status === 401 && !retried && !path.startsWith('/platform/auth/')) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options, true)
    setAccessToken(null)
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Request failed')
  }

  return res.json() as Promise<T>
}

async function tryRefresh(): Promise<User | null> {
  try {
    const res = await rawRequest('/platform/auth/refresh', { method: 'POST' })
    if (!res.ok) return null
    const data = (await res.json()) as AuthResponse
    setAccessToken(data.access_token)
    return data.user
  } catch {
    return null
  }
}

export const api = {
  login: async (email: string, password: string): Promise<User> => {
    const data = await request<AuthResponse>('/platform/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setAccessToken(data.access_token)
    return data.user
  },

  // Silent session restore on app boot: the cookie does the authenticating.
  restore: (): Promise<User | null> => tryRefresh(),

  logout: async (): Promise<void> => {
    try {
      await request('/platform/auth/logout', { method: 'POST' })
    } finally {
      setAccessToken(null)
    }
  },

  me: () => request<User>('/platform/auth/me'),

  listUsers: () =>
    request<{ users: Array<User & { is_active: boolean; created_at: string }> }>(
      '/platform/auth/users'
    ),

  changePassword: async (currentPassword: string, newPassword: string): Promise<User> => {
    const data = await request<AuthResponse>('/platform/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
    setAccessToken(data.access_token)
    return data.user
  },
}
