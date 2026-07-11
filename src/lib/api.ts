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

export interface PlatformMeta {
  preview: boolean
  company_name: string
}

export interface DashboardKpis {
  scope: 'mine' | 'org'
  open_deals: number
  pipeline_value_cents: number
  weighted_forecast_cents: number
  win_rate_pct: number | null
  closed_deals: number
  tasks_due_today: number
  tasks_overdue: number
}

export interface TaskItem {
  id: string
  title: string
  due_at: string | null
  deal_id: string | null
  deal_name: string | null
  unit_id: string | null
  unit_title: string | null
}

export interface Stage {
  id: string
  name: string
  position: number
  win_probability: number
}

export interface Pipeline {
  id: string
  name: string
  position: number
  stages: Stage[]
}

export interface DealCard {
  id: string
  name: string
  stage_id: string
  value_cents: number | null
  outcome: string | null
  owner_name: string | null
  company_name: string | null
}

export interface DealDetailResponse {
  deal: {
    id: string
    name: string
    value_cents: number | null
    commission_pct: number | null
    expected_close: string | null
    closed_at: string | null
    outcome: string | null
    lost_reason: string | null
    legacy_source: string | null
    created_at: string
    pipeline_id: string
    pipeline_name: string
    stage_id: string
    stage_name: string
    owner_name: string | null
    contact_name: string | null
    contact_email: string | null
    contact_phone: string | null
    company_name: string | null
  }
  stage_history: Array<{
    at: string
    from_stage: string | null
    to_stage: string
    actor_name: string | null
  }>
  activities: Array<{
    id: string
    kind: string
    subject: string | null
    body: string
    occurred_at: string
    rep_name: string | null
  }>
  tasks: Array<{
    id: string
    title: string
    due_at: string | null
    done_at: string | null
    owner_name: string | null
  }>
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

  // ── 3c-2 native surfaces ──
  meta: () => request<PlatformMeta>('/platform/meta'),

  dashboard: () => request<DashboardKpis>('/platform/dashboard'),

  myTasks: () => request<{ tasks: TaskItem[] }>('/platform/tasks'),

  createTask: (input: { title: string; due_at?: string; deal_id?: string }) =>
    request<{ id: string }>('/platform/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  completeTask: (taskId: string) =>
    request<{ ok: boolean }>(`/platform/tasks/${taskId}/complete`, { method: 'POST' }),

  pipelines: () => request<{ pipelines: Pipeline[] }>('/platform/pipelines'),

  pipelineDeals: (pipelineId: string) =>
    request<{ deals: DealCard[] }>(`/platform/pipelines/${pipelineId}/deals`),

  dealDetail: (dealId: string) => request<DealDetailResponse>(`/platform/deals/${dealId}`),

  moveDeal: (dealId: string, toStageId: string) =>
    request<{ ok: boolean }>(`/platform/deals/${dealId}/move`, {
      method: 'POST',
      body: JSON.stringify({ to_stage_id: toStageId }),
    }),

  logActivity: (dealId: string, input: { kind: 'note' | 'call'; subject?: string; body: string }) =>
    request<{ id: string }>(`/platform/deals/${dealId}/activities`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  changePassword: async (currentPassword: string, newPassword: string): Promise<User> => {
    const data = await request<AuthResponse>('/platform/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
    setAccessToken(data.access_token)
    return data.user
  },
}
