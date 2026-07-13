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
  kind: 'sell' | 'buy' | string
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

export interface DealContactRef {
  id: string
  name: string | null
  email: string | null
}

// §2 merged read-side timeline: manual activities + audit events
// (created / deal_edited / stage_moved), newest first.
export interface TimelineItem {
  type: 'activity' | 'audit'
  at: string
  actor_name: string | null
  kind: string
  subject: string | null
  body: string | null
  summary: string | null
}

// P1: read-side resolution of the unit a deal is selling, for the CRM +
// website links. null when no unit resolves (show the "link a unit" panel).
export interface DealUnitLink {
  unit_id: string
  unit_title: string
  resolved_via: 'unit_id' | 'listing_spec'
  legacy_id: string | null
  listed_on_website: boolean
  website_url: string | null
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
    owner_id: string | null
    owner_name: string | null
    contact_id: string | null
    contact_name: string | null
    contact_email: string | null
    contact_phone: string | null
    company_id: string | null
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
  timeline: TimelineItem[]
  unit_link: DealUnitLink | null
  tasks: Array<{
    id: string
    title: string
    due_at: string | null
    done_at: string | null
    owner_name: string | null
  }>
}

export interface DealCreateInput {
  pipeline_id: string
  stage_id: string
  name: string
  contact_id?: string | null
  company_id?: string | null
  owner_id?: string | null
  value_cents?: number | null
  commission_pct?: number | null
  expected_close?: string | null
}

export interface DealPatchInput {
  name?: string
  contact_id?: string | null
  company_id?: string | null
  owner_id?: string | null
  value_cents?: number | null
  commission_pct?: number | null
  expected_close?: string | null
  to_stage_id?: string
}

export type DealScope = 'mine' | 'all'

// ── 3c-3 Inventory / Units / Offers ──
export type UnitStatus = 'available' | 'reserved' | 'in_transport' | 'under_maintenance' | 'sold'

// ── 3c-4 Valuation (latest_valuations is the only one-number read path) ──
export interface UnitValuation {
  flv_cents: number | null
  olv_cents: number | null
  fmv_cents: number | null
  tier: string
  confidence: number | null
  engine_data_version: string
  taken_at: string
  age_days: number
  stale: boolean
  revalue: boolean
}

export interface ValuationRun {
  run_token: string
  saveable: boolean
  save_block: string | null
  flv_cents: number | null
  olv_cents: number | null
  fmv_cents: number | null
  tier: string
  tier_label: string | null
  confidence: number | null
  confidence_label: string | null
  comp_count: number | null
  engine_data_version: string | null
  assumptions: string[]
  summary: string | null
  stale_comps_warning: boolean
  as_of: { hours: number | null; condition: string | null }
}

export interface ValuationSnapshot {
  id: string
  flv_cents: number | null
  olv_cents: number | null
  fmv_cents: number | null
  tier: string
  confidence: number | null
  engine_data_version: string
  taken_at: string
  unit_hours: number | null
  unit_condition: string | null
  taken_by_name: string | null
}

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
  photo_url: string | null
  valuation: UnitValuation | null
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

// ── 3c-5 Contacts surface + global search ──
export type ContactType = 'buyer' | 'seller' | 'consigner_contact' | 'other'

export interface ContactRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  contact_type: ContactType
  hunting_for: string | null
  source: string
  company_id: string | null
  company_name: string | null
  owner_id: string | null
  owner_name: string | null
  created_at: string
}

export interface ContactListResponse {
  total: number
  page: number
  page_size: number
  contacts: ContactRow[]
}

export interface OwnerOption {
  id: string
  name: string
  is_active: boolean
}

export interface ContactListParams {
  q?: string
  contact_type?: string
  owner_id?: string
  company_id?: string
  page?: number
  page_size?: number
}

export interface ContactDetailResponse {
  contact: ContactRow & {
    first_name: string | null
    last_name: string | null
    lead_status: string | null
    legacy_source: string | null
  }
  deals: Array<{
    id: string
    name: string
    value_cents: number | null
    outcome: string | null
    pipeline_name: string
    stage_name: string
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

export interface ContactPatch {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  contact_type?: ContactType
  hunting_for?: string | null
}

// ── 3c-6 notifications (topbar bell) ──
export interface NotificationItem {
  id: string
  kind: 'stage_entry' | 'stall_alert' | 'system' | string
  subject: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface NotificationsResponse {
  unread: number
  notifications: NotificationItem[]
}

// ── 3c-8 documents / intake ──
export type DocType = 'title' | 'lien_release' | 'bill_of_sale' | 'wire_instructions' | 'inspection' | 'agreement' | 'photo' | 'other'

export interface DocumentRow {
  id: string
  doc_type: DocType
  file_name: string
  file_hash: string
  is_primary: boolean
  uploaded_at: string
  uploaded_by_name: string | null
  url: string | null
}

export interface DocumentsResponse {
  configured: boolean
  documents: DocumentRow[]
}

export interface ConsignerOption {
  id: string
  company_name: string
  split_pct: number | null
  notes: string | null
}

export interface IntakeExpenseInput {
  category: string
  amount_cents: number
  incurred_on: string
  note?: string
}

export interface InspectionItemInput {
  label: string
  result: 'pass' | 'fail' | 'na'
  note?: string
}

export interface IntakeInput {
  unit: {
    title: string
    category_id?: string | null
    make_id?: string | null
    model_id?: string | null
    year?: number | null
    serial?: string | null
    hours?: number | null
    condition?: string | null
    description?: string | null
    location?: string | null
    asking_price_cents?: number | null
    stock_cost_cents?: number | null
  }
  initial_status: 'available' | 'under_maintenance'
  consigner?: {
    consigner_id?: string
    new_company_name?: string
    split_pct?: number
    split_terms?: string
    notes?: string
  } | null
  expenses: IntakeExpenseInput[]
  inspection?: { items: InspectionItemInput[]; notes?: string } | null
}

// ── 3c-7 settings / commission report / sales sheet ──
export interface SettingRow {
  key: string
  label: string
  type: 'string' | 'int' | 'number_or_null' | 'bool' | 'timezone' | 'readonly'
  confirm: boolean
  value: unknown
  unset: boolean
  updated_at: string | null
}

export interface EmailLogRow {
  to_email: string
  subject: string
  context: string | null
  status: 'sent' | 'suppressed' | 'failed'
  detail: string | null
  created_at: string
}

export interface CommissionRepRow {
  rep_id: string | null
  rep_name: string
  won_count: number
  won_value_cents: number
  commission_cents: number
  deals_without_pct: number
  deals_without_value: number
  complete: boolean
}

export interface CommissionReport {
  commission_default_pct: number | null
  reps: CommissionRepRow[]
}

export type SearchResultType = 'unit' | 'deal' | 'contact' | 'company'

export interface SearchResult {
  type: SearchResultType
  id: string
  title: string
  subtitle: string | null
  score: number
}

export interface UnitOffer {
  id: string
  amount_cents: number
  status: 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'fell_through'
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

// ── 4b HubSpot outbox screen + §5 inbound door ──
export type OutboxStatus = 'pending_approval' | 'pending' | 'in_flight' | 'done' | 'failed' | 'dismissed'

export interface OutboxQueueDepth {
  pending: number
  gated: number
  failed: number
  in_flight: number
  done: number
  oldest_pending_min: number | null
  oldest_gated_min: number | null
}

export interface OutboxRow {
  id: string
  entity_type: 'contact' | 'company' | 'deal'
  entity_id: string
  entity_label: string | null
  op: 'upsert' | 'archive' | 'associate'
  assoc_target_type: string | null
  assoc_target_id: string | null
  assoc_target_label: string | null
  status: OutboxStatus
  attempts: number
  last_error: string | null
  next_attempt_at: string | null
  created_at: string
  updated_at: string
}

export interface OutboxResponse {
  drain_armed: boolean
  queue: OutboxQueueDepth
  rows: OutboxRow[]
}

export interface OutboxPlan {
  outbox_id: string
  entity_type: string
  entity_id: string
  entity_label?: string | null
  op: string
  action: string
  hubspot_id?: string | null
  target_hubspot_id?: string | null
  assoc_target_type?: string
  assoc_target_id?: string
  properties?: Record<string, string>
  intended_lifecyclestage?: string | null
  note?: string
  ratchet_note?: string
}

export interface OutboxDryRunReport {
  mode: string
  drain_armed: boolean
  hubspot_writes_performed: number
  queue: OutboxQueueDepth
  planned: Record<string, number>
  ratchet_note: string | null
  rows: OutboxPlan[]
}

export interface InboundLead {
  id: string
  hubspot_contact_id: string
  name: string | null
  email: string | null
  phone: string | null
  lifecyclestage: string | null
  hs_created_at: string | null
  imported_at: string
  status: 'pending_approval' | 'approved' | 'dismissed'
  resolved_at: string | null
  resolved_by_name: string | null
}

export interface InboundLeadsResponse {
  counts: { pending: number; approved: number; dismissed: number }
  leads: InboundLead[]
}

// ── 4d TAB listing-fields capture ──
export type ListingFieldSource = 'derived_unit' | 'manual' | 'deal' | 'spec' | 'none'

export interface ListingField {
  key: string
  label: string
  value: string | null
  source: ListingFieldSource
  derivable_from_unit: boolean
}

export interface ListingFieldsResponse {
  deal_id: string
  deal_name: string
  unit: { id: string; title: string } | null
  at_publish_stage: boolean
  resubmit_to_tab: boolean
  tab_published_at: string | null
  tab_listing_id: string | null
  tab_publish_error: string | null
  tab_publish_armed: boolean
  publishable: boolean
  missing: string[]
  fields: ListingField[]
  derive_result?: { unit_linked: boolean; derived: string[]; still_missing: string[] }
}

// ── 4e Buyer Opportunity layer (buy-side interest tracker) ──
export type InterestStatus = 'info_sent' | 'negotiating' | 'cooling' | 'offer_made'

export interface BuyerOppFirstUnit {
  legacy_id: string | null
  serial: string | null
  title: string
  description: string | null
}

export interface BuyerOppCard {
  id: string
  name: string
  stage_id: string
  owner_id: string
  owner_name: string | null
  buyer_name: string | null
  buyer_company: string | null
  unit_count: number
  outcome: 'won' | 'lost' | null
  probability_to_close: number | null
  expected_close: string | null
  first_unit: BuyerOppFirstUnit | null
  is_mine: boolean
}

export interface BuyerBoardResponse {
  pipeline: { id: string; name: string; stages: Stage[] }
  opportunities: BuyerOppCard[]
}

export interface BuyerOppUnit {
  link_id: string
  unit_id: string
  unit_title: string
  unit_status: UnitStatus
  asking_price_cents: number | null
  target_price_cents: number | null
  interest_status: InterestStatus
  legacy_id: string | null
  serial: string | null
  description: string | null
  listed_on_website: boolean
  website_url: string | null
  offer_id: string | null
  offer_status: string | null
  offer_amount_cents: number | null
  note: string | null
}

export interface BuyerOppNote {
  id: string
  subject: string | null
  body: string
  occurred_at: string
  rep_name: string | null
}

export interface BuyerOppDetailResponse {
  opportunity: {
    id: string
    name: string
    notes: string | null
    outcome: 'won' | 'lost' | null
    lost_reason: string | null
    created_at: string
    pipeline_id: string
    pipeline_name: string
    stage_id: string
    stage_name: string
    owner_id: string
    owner_name: string | null
    buyer_contact_id: string
    buyer_name: string | null
    buyer_email: string | null
    buyer_phone: string | null
    company_id: string | null
    company_name: string | null
    probability_to_close: number | null
    expected_close: string | null
    can_edit: boolean
  }
  stages: Stage[]
  units: BuyerOppUnit[]
  activities: BuyerOppNote[]
  stage_history: Array<{
    at: string
    from_stage: string | null
    to_stage: string
    actor_name: string | null
  }>
}

// The point of the feature: cross-rep "who's working this unit"
export interface UnitBuyerInterest {
  opportunity_id: string
  owner_id: string
  owner_name: string | null
  buyer_name: string | null
  buyer_company: string | null
  stage_name: string
  interest_status: InterestStatus
  target_price_cents: number | null
  note: string | null
  opp_notes: string | null
  has_offer: boolean
  is_mine: boolean
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

  createTask: (input: { title: string; due_at?: string; deal_id?: string; unit_id?: string; contact_id?: string; assignee_id?: string }) =>
    request<{ id: string }>('/platform/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  completeTask: (taskId: string) =>
    request<{ ok: boolean }>(`/platform/tasks/${taskId}/complete`, { method: 'POST' }),

  pipelines: () => request<{ pipelines: Pipeline[] }>('/platform/pipelines'),

  pipelineDeals: (pipelineId: string, scope: DealScope = 'mine') =>
    request<{ deals: DealCard[] }>(`/platform/pipelines/${pipelineId}/deals?scope=${scope}`),

  createDeal: (input: DealCreateInput) =>
    request<{ id: string }>('/platform/deals', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  patchDeal: (dealId: string, patch: DealPatchInput) =>
    request<{ ok: boolean; moved?: boolean; edited?: boolean; unchanged?: boolean }>(
      `/platform/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),

  batchMoveDeals: (pipelineId: string, dealIds: string[], toStageId: string) =>
    request<{ ok: boolean; moved: string[]; moved_count: number; requested: number }>(
      `/platform/pipelines/${pipelineId}/deals/batch-move`, {
        method: 'POST',
        body: JSON.stringify({ deal_ids: dealIds, to_stage_id: toStageId }),
      }),

  batchArchiveDeals: (pipelineId: string, dealIds: string[]) =>
    request<{ ok: boolean; archived: string[]; archived_count: number }>(
      `/platform/pipelines/${pipelineId}/deals/batch-archive`, {
        method: 'POST',
        body: JSON.stringify({ deal_ids: dealIds }),
      }),

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

  transitionUnit: (unitId: string, toStatus: string, note?: string, releaseReason?: string) =>
    request<{ ok: boolean; from_status: string; to_status: string; deal_closed: string | null }>(
      `/platform/units/${unitId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ to_status: toStatus, note, release_reason: releaseReason }),
      }),

  // ── 3c-4 Valuation: run → review → explicit save; nothing recomputes silently ──
  runValuation: (unitId: string) =>
    request<ValuationRun>(`/platform/units/${unitId}/valuation/run`, { method: 'POST' }),

  saveValuation: (unitId: string, runToken: string) =>
    request<{ id: string; taken_at: string }>(`/platform/units/${unitId}/valuation/save`, {
      method: 'POST',
      body: JSON.stringify({ run_token: runToken }),
    }),

  unitValuations: (unitId: string) =>
    request<{ snapshots: ValuationSnapshot[] }>(`/platform/units/${unitId}/valuations`),

  // ── 3c-5 Contacts surface + global search ──
  contacts: (params: ContactListParams = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return request<ContactListResponse>(`/platform/contacts${suffix}`)
  },

  contactOwners: () => request<{ owners: OwnerOption[] }>('/platform/contacts/owners'),

  createContact: (input: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    contact_type?: ContactType
    hunting_for?: string
    company_id?: string
  }) =>
    request<{ id: string }>('/platform/contacts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  contactDetail: (contactId: string) =>
    request<ContactDetailResponse>(`/platform/contacts/${contactId}`),

  updateContact: (contactId: string, patch: ContactPatch) =>
    request<{ ok: boolean }>(`/platform/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  reassignContactOwner: (contactId: string, ownerId: string | null) =>
    request<{ ok: boolean }>(`/platform/contacts/${contactId}/owner`, {
      method: 'POST',
      body: JSON.stringify({ owner_id: ownerId }),
    }),

  logContactActivity: (contactId: string, input: { kind: 'note' | 'call'; subject?: string; body: string }) =>
    request<{ id: string }>(`/platform/contacts/${contactId}/activities`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  globalSearch: (q: string) =>
    request<{ results: SearchResult[] }>(`/platform/search?q=${encodeURIComponent(q)}`),

  // ── 3c-6 notifications + password reset ──
  notifications: () => request<NotificationsResponse>('/platform/notifications'),

  markNotificationRead: (notificationId: string) =>
    request<{ ok: boolean }>(`/platform/notifications/${notificationId}/read`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    request<{ ok: boolean; marked: number }>('/platform/notifications/read-all', { method: 'POST' }),

  // ── 3c-8 documents / intake ──
  documentsStatus: () => request<{ configured: boolean }>('/platform/documents/status'),

  documents: (parent: { unit_id?: string; deal_id?: string }) => {
    const qs = parent.unit_id ? `unit_id=${parent.unit_id}` : `deal_id=${parent.deal_id}`
    return request<DocumentsResponse>(`/platform/documents?${qs}`)
  },

  // presign → browser PUT → complete (backend hashes server-side)
  uploadDocument: async (
    parent: { unit_id?: string; deal_id?: string },
    docType: DocType,
    file: File
  ): Promise<{ id: string; file_hash: string; is_primary: boolean }> => {
    const presign = await request<{ file_key: string; upload_url: string }>(
      '/platform/documents/presign', {
        method: 'POST',
        body: JSON.stringify({
          ...parent, doc_type: docType, file_name: file.name,
          content_type: file.type || 'application/octet-stream',
        }),
      })
    const put = await fetch(presign.upload_url, {
      method: 'PUT',
      body: file,
      headers: file.type ? { 'Content-Type': file.type } : undefined,
    })
    if (!put.ok) throw new Error(`Upload failed (${put.status})`)
    return request<{ id: string; file_hash: string; is_primary: boolean }>(
      '/platform/documents/complete', {
        method: 'POST',
        body: JSON.stringify({
          file_key: presign.file_key, ...parent,
          doc_type: docType, file_name: file.name,
        }),
      })
  },

  documentUrl: (documentId: string) =>
    request<{ url: string }>(`/platform/documents/${documentId}/url`),

  setPrimaryPhoto: (documentId: string) =>
    request<{ ok: boolean }>(`/platform/documents/${documentId}/primary`, { method: 'POST' }),

  archiveDocument: (documentId: string) =>
    request<{ ok: boolean }>(`/platform/documents/${documentId}/archive`, { method: 'POST' }),

  consigners: () => request<{ consigners: ConsignerOption[] }>('/platform/consigners'),

  intakeUnit: (input: IntakeInput) =>
    request<{ unit_id: string; inspection_document_id: string | null; prompt_valuation: boolean }>(
      '/platform/units/intake', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

  // ── 3c-7 settings / reports / sales sheet ──
  settings: () => request<{ settings: SettingRow[] }>('/platform/settings'),

  updateSetting: (key: string, value: unknown, confirm = false) =>
    request<{ ok: boolean; key: string; value: unknown; unset: boolean }>(
      `/platform/settings/${key}`, {
        method: 'PATCH',
        body: JSON.stringify({ value, confirm }),
      }),

  emailLog: () => request<{ emails: EmailLogRow[] }>('/platform/settings/email-log'),

  commissionReport: () => request<CommissionReport>('/platform/reports/commission'),

  salesSheet: (unitId: string) =>
    request<{ html: string; spec_source: 'published' | 'generated' | 'none' }>(
      `/platform/units/${unitId}/sales-sheet`),

  // ── 4d TAB listing-fields capture (deal detail) ──
  listingFields: (dealId: string) =>
    request<ListingFieldsResponse>(`/platform/deals/${dealId}/listing-fields`),

  linkDealUnit: (dealId: string, unitId: string) =>
    request<ListingFieldsResponse>(`/platform/deals/${dealId}/unit`, {
      method: 'POST', body: JSON.stringify({ unit_id: unitId }),
    }),

  unlinkDealUnit: (dealId: string) =>
    request<ListingFieldsResponse>(`/platform/deals/${dealId}/unit`, { method: 'DELETE' }),

  deriveListingFields: (dealId: string) =>
    request<ListingFieldsResponse>(`/platform/deals/${dealId}/listing-fields/derive`, {
      method: 'POST',
    }),

  patchListingFields: (dealId: string, values: Record<string, string>) =>
    request<ListingFieldsResponse>(`/platform/deals/${dealId}/listing-fields`, {
      method: 'PATCH', body: JSON.stringify({ values }),
    }),

  requestTabPublish: (dealId: string) =>
    request<{ ok: boolean; resubmit_to_tab: boolean }>(
      `/platform/deals/${dealId}/tab-publish-request`, { method: 'POST' }),

  cancelTabPublish: (dealId: string) =>
    request<{ ok: boolean; resubmit_to_tab: boolean }>(
      `/platform/deals/${dealId}/tab-publish-request`, { method: 'DELETE' }),

  // ── 4b HubSpot outbox + inbound door (admin) ──
  outbox: (status?: OutboxStatus) =>
    request<OutboxResponse>(`/platform/outbox${status ? `?status=${status}` : ''}`),

  outboxPlan: (outboxId: string) =>
    request<OutboxPlan>(`/platform/outbox/${outboxId}/plan`),

  retryOutboxRow: (outboxId: string) =>
    request<{ ok: boolean; status: string }>(`/platform/outbox/${outboxId}/retry`, { method: 'POST' }),

  approveOutboxRow: (outboxId: string) =>
    request<{ ok: boolean; status: string }>(`/platform/outbox/${outboxId}/approve`, { method: 'POST' }),

  dismissOutboxRow: (outboxId: string) =>
    request<{ ok: boolean; status: string }>(`/platform/outbox/${outboxId}/dismiss`, { method: 'POST' }),

  outboxDryRun: () =>
    request<OutboxDryRunReport>('/platform/outbox/dry-run', { method: 'POST' }),

  inboundLeads: (status: 'pending_approval' | 'approved' | 'dismissed' = 'pending_approval') =>
    request<InboundLeadsResponse>(`/platform/inbound-leads?status=${status}`),

  approveInboundLead: (leadId: string) =>
    request<{ ok: boolean; contact_id: string; already_existed: boolean }>(
      `/platform/inbound-leads/${leadId}/approve`, { method: 'POST' }),

  dismissInboundLead: (leadId: string) =>
    request<{ ok: boolean; status: string }>(
      `/platform/inbound-leads/${leadId}/dismiss`, { method: 'POST' }),

  requestPasswordReset: (email: string) =>
    request<{ ok: boolean }>('/platform/auth/request-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    request<{ ok: boolean }>('/platform/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  changePassword: async (currentPassword: string, newPassword: string): Promise<User> => {
    const data = await request<AuthResponse>('/platform/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
    setAccessToken(data.access_token)
    return data.user
  },

  // ── 4e Buyer Opportunity layer ──
  buyerOpportunities: (params: { mine?: boolean; owner_id?: string } = {}) => {
    const qs = new URLSearchParams()
    if (params.mine) qs.set('mine', 'true')
    if (params.owner_id) qs.set('owner_id', params.owner_id)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return request<BuyerBoardResponse>(`/platform/buyer-opportunities${suffix}`)
  },

  createBuyerOpportunity: (input: {
    buyer_contact_id: string
    name?: string
    notes?: string
    stage_id?: string
    probability_to_close?: number | null
    expected_close?: string | null
    units?: Array<{ unit_id: string; target_price_cents?: number | null; interest_status?: InterestStatus }>
  }) =>
    request<{ id: string }>('/platform/buyer-opportunities', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  buyerOpportunityDetail: (oppId: string) =>
    request<BuyerOppDetailResponse>(`/platform/buyer-opportunities/${oppId}`),

  editBuyerOpportunity: (oppId: string, patch: { name?: string; notes?: string; buyer_contact_id?: string; probability_to_close?: number | null; expected_close?: string | null }) =>
    request<{ ok: boolean }>(`/platform/buyer-opportunities/${oppId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  addBuyerNote: (oppId: string, input: { body: string; subject?: string }) =>
    request<{ id: string }>(`/platform/buyer-opportunities/${oppId}/activities`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  moveBuyerOpportunity: (oppId: string, toStageId: string) =>
    request<{ ok: boolean }>(`/platform/buyer-opportunities/${oppId}/move`, {
      method: 'POST',
      body: JSON.stringify({ to_stage_id: toStageId }),
    }),

  attachBuyerUnit: (oppId: string, input: { unit_id: string; target_price_cents?: number | null; interest_status?: InterestStatus; note?: string }) =>
    request<{ id: string }>(`/platform/buyer-opportunities/${oppId}/units`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateBuyerUnit: (oppId: string, linkId: string, patch: { target_price_cents?: number | null; interest_status?: InterestStatus; note?: string; offer_id?: string; clear_offer?: boolean }) =>
    request<{ ok: boolean }>(`/platform/buyer-opportunities/${oppId}/units/${linkId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  detachBuyerUnit: (oppId: string, linkId: string) =>
    request<{ ok: boolean }>(`/platform/buyer-opportunities/${oppId}/units/${linkId}`, {
      method: 'DELETE',
    }),

  unitBuyerInterest: (unitId: string) =>
    request<{ unit_listed: boolean; unit_website_url: string | null; interest: UnitBuyerInterest[] }>(
      `/platform/units/${unitId}/buyer-interest`),
}
