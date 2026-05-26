const BASE = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:8000')

function getToken(): string | null {
  return localStorage.getItem('ar_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('ar_token')
    localStorage.removeItem('ar_user')
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }

  return res.json() as Promise<T>
}

export interface User {
  id: number
  email: string
  name: string
  role: string
  is_active: boolean
}

export interface LoginResponse {
  token: string
  user: User
}

export interface PermissionsResponse {
  permissions: Record<string, boolean>
}

export interface UserPermission {
  user_id: number
  tab_key: string
  granted: boolean
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>('/auth/me'),

  permissionsMe: () => request<PermissionsResponse>('/permissions/me'),

  adminGetAllPermissions: () =>
    request<{ users: Array<User & { permissions: Record<string, boolean> }> }>(
      '/admin/permissions'
    ),

  adminSetPermission: (user_id: number, tab_key: string, granted: boolean) =>
    request<{ success: boolean }>('/admin/permissions', {
      method: 'POST',
      body: JSON.stringify({ user_id, tab_key, granted }),
    }),
}
