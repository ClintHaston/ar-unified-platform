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

// ── 3c-3 Inventory / Units / Offers ──
export type UnitStatus = 'available' | 'reserved' | 'in_transport' | 'under_maintenance' | 'sold'

export interface UnitCard {
  id: string
  title: string
  year: number | null
  hours: number | null
  condition: string | null
  serial: string | null
  status: UnitStatus
  asking_price_cents: number | null
  location: string | null
  archived: boolean
  category_id: string | null
  make_id: string | null
  model_id: string | null
  category_name: string | null
  make_name: string | null
  model_name: string | null
  reserved_until: string | null
}

export interface TaxonomyLists {
  categories: Array<{ id: string; name: string }>
  makes: Array<{ id: string; name: string }>
  models: Array<{ id: string; name: string; category_id: string; make_id: string }>
}

export interface ContactHit {
  id: string
  name: string | null
  email: string | null
  company_name: string | null
}

export interface UnitOffer {
  id: string
  amount_cents: number
  status: 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn'
  expires_at: string
  responded_at: string | null
  note: string | null
  created_at: string
  deal_id: string | null
  deal_name: string | null
  rep_name: string | null
  buyer_name: string | null
  buyer_company: string | null
}

export interface UnitDetailResponse {
  unit: UnitCard & {
    description: string | null
    stock_cost_cents: number | null
    legacy_source: string | null
    legacy_id: string | null
    created_at: string
  }
  allowed_transitions: string[]
  status_history: Array<{
    at: string
    from_status: string | null
    to_status: string
    note: string | null
    actor_name: string | null
    offer_id: string | null
    offer_amount_cents: number | null
  }>
  expenses: Array<{
    id: string
    category: string
    amount_cents: number
    incurred_on: string
    note: string | null
    created_by_name: string | null
  }>
  expense_total_cents: number
  offers: UnitOffer[]
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

  // ── 3c-3 Inventory / Units / Offers ──
  units: (includeArchived = false) =>
    request<{ units: UnitCard[] }>(`/platform/units${includeArchived ? '?include_archived=true' : ''}`),

  unitDetail: (unitId: string) => request<UnitDetailResponse>(`/platform/units/${unitId}`),

  taxonomy: () => request<TaxonomyLists>('/platform/taxonomy'),

  searchContacts: (q: string) =>
    request<{ contacts: ContactHit[] }>(`/platform/contacts/search?q=${encodeURIComponent(q)}`),

  addExpense: (unitId: string, input: { category: string; amount_cents: number; incurred_on: string; note?: string }) =>
    request<{ id: string }>(`/platform/units/${unitId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  assignTaxonomy: (unitId: string, input: { category_id: string | null; make_id: string | null; model_id: string | null }) =>
    request<{ ok: boolean }>(`/platform/units/${unitId}/taxonomy`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  logOffer: (unitId: string, input: { buyer_contact_id: string; amount_cents: number; expires_at?: string; deal_id?: string; note?: string }) =>
    request<{ id: string; expires_at: string }>(`/platform/units/${unitId}/offers`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  acceptOffer: (offerId: string) =>
    request<{ ok: boolean; unit_status: string; reserved_until: string }>(
      `/platform/offers/${offerId}/accept`, { method: 'POST' }),

  declineOffer: (offerId: string, note?: string) =>
    request<{ ok: boolean; status: string }>(`/platform/offers/${offerId}/decline`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  withdrawOffer: (offerId: string, note?: string) =>
    request<{ ok: boolean; status: string }>(`/platform/offers/${offerId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    }),

  transitionUnit: (unitId: string, toStatus: string, note?: string) =>
    request<{ ok: boolean; from_status: string; to_status: string; deal_closed: string | null }>(
      `/platform/units/${unitId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to_status: toStatus, note }),
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
