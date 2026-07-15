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
// WS2a: a logged call carries a disposition. Six values, enforced server-side.
export type CallOutcome =
  | 'connected' | 'voicemail' | 'no-answer' | 'callback' | 'wrong-number' | 'other'

export interface TimelineItem {
  type: 'activity' | 'audit'
  at: string
  actor_name: string | null
  kind: string
  subject: string | null
  body: string | null
  summary: string | null
  call_outcome?: CallOutcome | null
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
  legacy_id: string | null
  open_offer_count: number
  top_open_offer_cents: number | null
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
  sales_lead_status: SalesLeadStatus | null
  last_activity_at: string | null
  created_at: string
}

// HubSpot "Lead Status" parity (Step 0). Distinct from the inbound-door
// lead_status. Forward-populated by reps; NULL until set.
export type SalesLeadStatus = 'New' | 'Open' | 'In Progress' | 'Connected' | 'Unqualified' | 'Bad Timing'
export const SALES_LEAD_STATUSES: SalesLeadStatus[] = ['New', 'Open', 'In Progress', 'Connected', 'Unqualified', 'Bad Timing']

export type ContactSort = 'name' | 'email' | 'type' | 'lead_status' | 'company' | 'owner' | 'last_activity' | 'created'
export type SortDir = 'asc' | 'desc'

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
  sort?: ContactSort
  dir?: SortDir
  page?: number
  page_size?: number
}

// ── Segments (Lists) ──
export type SegmentObjectType = 'contact' | 'company'
export type SegmentType = 'active' | 'static'
export type SegmentPropType = 'enum' | 'uuid_ref' | 'text' | 'date'

export interface SegmentCondition {
  field: string
  operator: string
  value?: string | null
}
export interface SegmentGroup { conditions: SegmentCondition[] }
export interface SegmentCriteria { groups: SegmentGroup[] }

export interface SegmentOperator { key: string; label: string }
export interface SegmentProp {
  key: string
  label: string
  type: SegmentPropType
  ref?: 'owner' | 'company' | null
  options?: string[] | null
  operators: SegmentOperator[]
}
export interface SegmentSource {
  key: string
  label: string
  object_type: SegmentObjectType
  props: SegmentProp[]
}

export interface SegmentListItem {
  id: string
  name: string
  description: string | null
  object_type: SegmentObjectType
  type: SegmentType
  criteria: SegmentCriteria
  owner_id: string
  owner_name: string | null
  count: number
  updated_at: string
}
export interface SegmentDetailResponse {
  id: string
  name: string
  description: string | null
  object_type: SegmentObjectType
  type: SegmentType
  criteria: SegmentCriteria
  owner_id: string
  owner_name: string | null
  count: number
  created_at: string
  updated_at: string
}
export interface CompanyMemberRow {
  id: string
  name: string
  domain: string | null
  city: string | null
  state: string | null
  created_at: string
}
export interface SegmentMembersResponse {
  total: number
  page: number
  page_size: number
  object_type: SegmentObjectType
  members: Array<ContactRow | CompanyMemberRow>
}

// P1 contacts-coherence (read-only)
export interface ContactBuyOpp {
  id: string
  name: string
  stage_name: string
  probability_to_close: number | null
  expected_close: string | null
  outcome: 'won' | 'lost' | null
  unit_count: number
}

export interface ContactOffer {
  id: string
  amount_cents: number
  status: string
  expires_at: string | null
  responded_at: string | null
  created_at: string
  unit_id: string
  unit_title: string
  unit_legacy_id: string | null
  unit_desc: string | null
  listed_on_website: boolean
  website_url: string | null
  deal_id: string | null
  deal_name: string | null
}

export interface ConsignmentUnit {
  unit_id: string
  title: string
  legacy_id: string | null
  description: string | null
  status: string
  listed_on_website: boolean
  website_url: string | null
}

export interface ConsignmentDoc {
  id: string
  doc_type: string
  file_name: string
  uploaded_at: string
  uploaded_by_name: string | null
  url: string | null
}

export interface Consignment {
  consigner: {
    id: string
    split_terms: string | null
    split_pct: number | null
    payout_status: string | null
    payment_details_on_file: boolean
    notes: string | null
  }
  units: ConsignmentUnit[]
  documents_configured: boolean
  consigner_id: string
  contract_docs: ConsignmentDoc[]
  related_docs: ConsignmentDoc[]
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
    call_outcome?: CallOutcome | null
    rep_name: string | null
  }>
  tasks: Array<{
    id: string
    title: string
    due_at: string | null
    done_at: string | null
    owner_name: string | null
  }>
  buy_opps: ContactBuyOpp[]
  offers: ContactOffer[]
  consignment: Consignment | null
}

export interface ContactPatch {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  contact_type?: ContactType
  hunting_for?: string | null
  sales_lead_status?: SalesLeadStatus | null
}

// ── Company detail (reverses Amendment 18) ──
export interface CompanyDeal {
  id: string
  name: string
  value_cents: number | null
  outcome: 'won' | 'lost' | null
  pipeline_name: string
  stage_name: string
  owner_name: string | null
}
export interface CompanyOffer {
  id: string
  amount_cents: number
  status: string
  expires_at: string | null
  created_at: string | null
  unit_id: string
  unit_title: string
  unit_legacy_id: string | null
  listed_on_website: boolean
  website_url: string | null
  deal_id: string | null
  deal_name: string | null
  buyer_contact_id: string
  buyer_name: string | null
}
export interface CompanyActivity {
  id: string
  kind: string
  subject: string | null
  body: string
  occurred_at: string
  call_outcome: CallOutcome | null
  rep_name: string | null
}
export interface CompanyRow {
  id: string
  name: string
  domain: string | null
  phone: string | null
  city: string | null
  state: string | null
  n_contacts: number
  n_open_deals: number
  created_at: string
}

export type CompanySort = 'name' | 'domain' | 'city' | 'contacts' | 'open_deals' | 'created'

export interface CompanyListResponse {
  total: number
  page: number
  page_size: number
  companies: CompanyRow[]
}

export interface CompanyListParams {
  q?: string
  sort?: CompanySort
  dir?: SortDir
  page?: number
  page_size?: number
}

export interface CompanyDetailResponse {
  company: {
    id: string
    name: string
    domain: string | null
    phone: string | null
    address_line1: string | null
    address_line2: string | null
    city: string | null
    state: string | null
    postal_code: string | null
    country: string | null
    notes: string | null
    created_at: string
  }
  counts: {
    contacts: number
    deals: number
    open_deals: number
    open_deal_value_cents: number
    open_offers: number
  }
  contacts_total: number
  contacts: ContactRow[]
  deals: CompanyDeal[]
  offers: CompanyOffer[]
  activity: CompanyActivity[]
  consignment: Consignment | null
}
export interface CompanyPatch {
  name?: string
  domain?: string | null
  phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  notes?: string | null
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

export interface PlatformUser {
  id: string
  email: string
  name: string
  role: string
  is_active: boolean
  locked_until: string | null
  last_active: string | null
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

// ── WS2a prebuilt reports ──
export interface ReportFilters {
  start?: string        // YYYY-MM-DD inclusive
  end?: string          // YYYY-MM-DD inclusive
  owner_id?: string
}

export interface FunnelStage {
  stage_id: string
  name: string
  position: number
  reached: number
  drop_from_prev: number | null
  conversion_from_prev_pct: number | null
  completed_visits: number
  avg_days_in_stage: number | null
  median_days_in_stage: number | null
}

export interface FunnelPipeline {
  pipeline_id: string
  pipeline_name: string
  stages: FunnelStage[]
}

export interface FunnelReport {
  pipelines: FunnelPipeline[]
}

export interface DealsByRepRow {
  rep_id: string
  rep_name: string
  period: string | null
  won_count: number
  lost_count: number
  won_value_cents: number
}

export interface DealsByRepReport {
  rows: DealsByRepRow[]
  totals: { won_count: number; lost_count: number; won_value_cents: number }
}

export interface CallActivityRow {
  rep_id: string
  rep_name: string
  period: string | null
  total: number
  no_outcome: number
  by_outcome: Record<CallOutcome, number>
}

export interface CallActivityReport {
  outcomes: CallOutcome[]
  rows: CallActivityRow[]
  total_calls: number
}

// ── WS2b custom report builder ──
export type ReportViz =
  | 'table' | 'bar' | 'number' | 'funnel'
  | 'stacked_bar' | 'grouped_bar' | 'line' | 'donut'
export type MeasureType = 'int' | 'cents' | 'number'

export interface RegistryField {
  key: string
  label: string
  type?: string
  options?: string[] | null
}

export interface RegistrySource {
  key: string
  label: string
  has_owner: boolean
  viz: ReportViz[]
  dimensions: RegistryField[]
  measures: RegistryField[]
  filters: RegistryField[]
}

export interface ReportFilterClause {
  field: string
  value: string
}

export interface ReportDefinition {
  source: string
  dimensions: string[]
  measures: string[]
  series?: string          // optional 2nd (breakdown) dimension for stacked/grouped/line
  filters: ReportFilterClause[]
  date?: { start?: string; end?: string }
  owner_id?: string
  viz: ReportViz
}

export interface RunColumn {
  key: string
  label: string
  type: string
  role: 'dimension' | 'series' | 'measure'
}

// Grouped result for every non-funnel viz. Breakdown charts carry an extra
// role:'series' column; the frontend pivots the long rows into wide chart data.
export interface RunGroupedResult {
  viz: 'table' | 'bar' | 'number' | 'stacked_bar' | 'grouped_bar' | 'line' | 'donut'
  columns: RunColumn[]
  rows: Array<Record<string, string | number | null>>
}

export type RunResult = RunGroupedResult | (FunnelReport & { viz: 'funnel' })

export interface SavedReport {
  id: string
  name: string
  definition: ReportDefinition
  owner_id: string
  owner_name: string | null
  updated_at: string
}

// ── WS2c saveable dashboards ──
export type PanelSize = 'full' | 'half'

export interface DashboardPanel {
  saved_report_id: string
  size: PanelSize
}

export interface DashboardFilters {
  date?: { start?: string; end?: string }
  owner_id?: string
}

export interface DashboardListItem {
  id: string
  name: string
  layout: DashboardPanel[]
  default_filters: DashboardFilters
  owner_id: string
  owner_name: string | null
  favorited: boolean
  panel_count: number
  updated_at: string
}

export interface DashboardMeta {
  id: string
  name: string
  layout: DashboardPanel[]
  default_filters: DashboardFilters
  favorited: boolean
}

export interface DashboardRunPanel {
  saved_report_id: string
  size: PanelSize
  name: string | null
  result?: RunResult
  error?: string
}

export interface DashboardRun {
  id: string
  name: string
  default_filters: DashboardFilters
  favorited: boolean
  panels: DashboardRunPanel[]
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
    listed_on_website: boolean
    website_url: string | null
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

  // A 401 on the FIRST attempt triggers (at most) one refresh + retry. The
  // retried request never refreshes again — a 401 after a fresh token is a
  // real auth failure, not another refresh trigger (loop guard).
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

// Single-flight refresh. The refresh token is a rotating, single-use httpOnly
// cookie (backend §2): each POST /auth/refresh consumes the presented token and
// issues a new one. So concurrent 401s must NOT each refresh — the first would
// rotate the token, and the losers would present the now-stale token, get a 401
// that clears the cookie, and resolve to null (rendering their list empty and
// risking a spurious logout on the next refresh). Instead, all concurrent
// callers await ONE in-flight refresh, so the rotating token is presented
// exactly once per window; every caller then retries once with the new token.
let refreshInFlight: Promise<User | null> | null = null

function tryRefresh(): Promise<User | null> {
  if (!refreshInFlight) {
    // reset once the shared refresh settles, so the next window starts fresh
    refreshInFlight = doRefresh().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

async function doRefresh(): Promise<User | null> {
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

// WS2a: report endpoints share start/end/owner_id filters.
function reportQs(f: ReportFilters): string {
  const p = new URLSearchParams()
  if (f.start) p.set('start', f.start)
  if (f.end) p.set('end', f.end)
  if (f.owner_id) p.set('owner_id', f.owner_id)
  const s = p.toString()
  return s ? `?${s}` : ''
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

  logActivity: (dealId: string, input: { kind: 'note' | 'call'; subject?: string; body: string; call_outcome?: CallOutcome | null }) =>
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

  companies: (params: CompanyListParams = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    return request<CompanyListResponse>(`/platform/companies${suffix}`)
  },

  companyDetail: (companyId: string) =>
    request<CompanyDetailResponse>(`/platform/companies/${companyId}`),

  updateCompany: (companyId: string, patch: CompanyPatch) =>
    request<{ ok: boolean }>(`/platform/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

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

  // Bulk owner reassignment from the list multi-select bar (admin-only,
  // server-enforced 403 for non-admins).
  batchReassignContactOwner: (contactIds: string[], ownerId: string | null) =>
    request<{ ok: boolean; requested: number; changed: number }>(
      '/platform/contacts/batch-owner', {
        method: 'POST',
        body: JSON.stringify({ contact_ids: contactIds, owner_id: ownerId }),
      }),

  // CSV of the current filtered+sorted set (no pagination). Returns a Blob so
  // the caller can trigger a browser download. Refreshes once on a 401 like
  // request(), since the export is a deliberate user action.
  exportContactsCsv: async (params: ContactListParams = {}): Promise<Blob> => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && k !== 'page' && k !== 'page_size') qs.set(k, String(v))
    }
    const path = `/platform/contacts/export.csv${qs.toString() ? `?${qs.toString()}` : ''}`
    let res = await rawRequest(path)
    if (res.status === 401) {
      const refreshed = await tryRefresh()
      if (refreshed) res = await rawRequest(path)
    }
    if (!res.ok) throw new Error('Export failed')
    return res.blob()
  },

  // ── Segments (Lists) ──
  segmentRegistry: () => request<{ sources: SegmentSource[] }>('/platform/segments/registry'),

  listSegments: (params: { object_type?: SegmentObjectType; type?: SegmentType } = {}) => {
    const qs = new URLSearchParams()
    if (params.object_type) qs.set('object_type', params.object_type)
    if (params.type) qs.set('type', params.type)
    const s = qs.toString()
    return request<{ segments: SegmentListItem[] }>(`/platform/segments${s ? `?${s}` : ''}`)
  },

  createSegment: (body: {
    name: string
    description?: string | null
    object_type: SegmentObjectType
    type: SegmentType
    criteria?: SegmentCriteria
    member_ids?: string[]
  }) => request<{ id: string; seeded: number }>('/platform/segments', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  getSegment: (id: string) => request<SegmentDetailResponse>(`/platform/segments/${id}`),

  updateSegment: (id: string, patch: { name?: string; description?: string | null; criteria?: SegmentCriteria }) =>
    request<{ id: string; ok?: boolean; unchanged?: boolean }>(`/platform/segments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  archiveSegment: (id: string) =>
    request<{ ok: boolean }>(`/platform/segments/${id}/archive`, { method: 'POST' }),

  segmentMembers: (id: string, params: { sort?: ContactSort; dir?: SortDir; page?: number; page_size?: number } = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) qs.set(k, String(v))
    }
    const s = qs.toString()
    return request<SegmentMembersResponse>(`/platform/segments/${id}/members${s ? `?${s}` : ''}`)
  },

  addSegmentMembers: (id: string, recordIds: string[]) =>
    request<{ ok: boolean; requested: number; added: number }>(`/platform/segments/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ record_ids: recordIds }),
    }),

  removeSegmentMember: (id: string, recordId: string) =>
    request<{ ok: boolean }>(`/platform/segments/${id}/members/${recordId}`, { method: 'DELETE' }),

  logContactActivity: (contactId: string, input: { kind: 'note' | 'call' | 'email' | 'meeting'; subject?: string; body: string; call_outcome?: CallOutcome | null }) =>
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
    parent: { unit_id?: string; deal_id?: string; consigner_id?: string },
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

  // ── Task B: admin user management (Settings > Team) ──
  adminUsers: () => request<{ users: PlatformUser[] }>('/platform/users'),
  createPlatformUser: (input: { email: string; name: string; role: string }) =>
    request<{ user: PlatformUser; temp_password: string }>('/platform/users', {
      method: 'POST', body: JSON.stringify(input),
    }),
  resetPlatformUserPassword: (id: string) =>
    request<{ temp_password: string }>(`/platform/users/${id}/reset-password`, { method: 'POST' }),
  updatePlatformUser: (id: string, patch: { role?: string; is_active?: boolean; name?: string }) =>
    request<{ ok: boolean }>(`/platform/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  // ── WS2a prebuilt reports (admin-only, read-only) ──
  sellFunnel: (f: ReportFilters = {}) =>
    request<FunnelReport>(`/platform/reports/pipeline-funnel${reportQs(f)}`),
  buyFunnel: (f: ReportFilters = {}) =>
    request<FunnelReport>(`/platform/reports/buy-funnel${reportQs(f)}`),
  dealsByRep: (f: ReportFilters = {}) =>
    request<DealsByRepReport>(`/platform/reports/deals-by-rep${reportQs(f)}`),
  callActivity: (f: ReportFilters = {}) =>
    request<CallActivityReport>(`/platform/reports/call-activity${reportQs(f)}`),

  // ── WS2b custom report builder (admin-only) ──
  reportRegistry: () => request<{ sources: RegistrySource[] }>('/platform/reports/registry'),
  runReport: (definition: ReportDefinition) =>
    request<RunResult>('/platform/reports/run', { method: 'POST', body: JSON.stringify(definition) }),
  savedReports: () => request<{ reports: SavedReport[] }>('/platform/reports/saved'),
  createSavedReport: (name: string, definition: ReportDefinition) =>
    request<SavedReport>('/platform/reports/saved', {
      method: 'POST', body: JSON.stringify({ name, definition }),
    }),
  updateSavedReport: (id: string, patch: { name?: string; definition?: ReportDefinition }) =>
    request<SavedReport>(`/platform/reports/saved/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSavedReport: (id: string) =>
    request<{ ok: boolean }>(`/platform/reports/saved/${id}`, { method: 'DELETE' }),

  // ── WS2c dashboards (admin-only) ──
  dashboards: () => request<{ dashboards: DashboardListItem[] }>('/platform/dashboards'),
  dashboardMeta: (id: string) => request<DashboardMeta>(`/platform/dashboards/${id}`),
  runDashboard: (id: string, f: ReportFilters = {}) =>
    request<DashboardRun>(`/platform/dashboards/${id}/run${reportQs(f)}`),
  createDashboard: (input: { name: string; layout: DashboardPanel[]; default_filters: DashboardFilters }) =>
    request<DashboardMeta>('/platform/dashboards', { method: 'POST', body: JSON.stringify(input) }),
  updateDashboard: (id: string, patch: { name?: string; layout?: DashboardPanel[]; default_filters?: DashboardFilters }) =>
    request<DashboardMeta>(`/platform/dashboards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteDashboard: (id: string) =>
    request<{ ok: boolean }>(`/platform/dashboards/${id}`, { method: 'DELETE' }),
  favoriteDashboard: (id: string) =>
    request<{ ok: boolean; favorited: boolean }>(`/platform/dashboards/${id}/favorite`, { method: 'POST' }),
  unfavoriteDashboard: (id: string) =>
    request<{ ok: boolean; favorited: boolean }>(`/platform/dashboards/${id}/favorite`, { method: 'DELETE' }),

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
