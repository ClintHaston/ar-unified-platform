import type { IconName } from './icons'

// Single source of truth for the sidebar AND the command palette's go-to
// commands. Routes here all already exist (or resolve to clean placeholders);
// nothing new is invented. `buy` marks the teal buy-side context; `adminOnly`
// gates as today.

export interface FlyoutItem {
  label: string
  path: string
  icon: IconName
  sublabel?: string
  adminOnly?: boolean
  buy?: boolean
}

export interface NavItem {
  key: string
  label: string
  icon: IconName
  path: string
  buy?: boolean
  adminOnly?: boolean
  section: 'primary' | 'tools' | 'admin'
  flyout?: { head?: string; items: FlyoutItem[] }
}

export const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', path: '/dashboard', section: 'primary' },
  { key: 'pipeline', label: 'Pipeline', icon: 'pipeline', path: '/pipelines', section: 'primary' },
  { key: 'inventory', label: 'Inventory', icon: 'inventory', path: '/inventory', section: 'primary' },
  {
    key: 'contacts', label: 'Contacts', icon: 'contacts', path: '/contacts', section: 'primary',
    flyout: {
      head: 'CRM',
      items: [
        { label: 'Contacts', path: '/contacts', icon: 'contacts' },
        { label: 'Lists', path: '/lists', icon: 'contacts', sublabel: 'saved segments' },
        { label: 'Companies', path: '/contacts', icon: 'company' },
        { label: 'Deals', path: '/pipelines', icon: 'deal', sublabel: 'on the pipeline board' },
        { label: 'Offers', path: '/inventory', icon: 'offer', sublabel: 'logged on each unit' },
      ],
    },
  },
  { key: 'lists', label: 'Lists', icon: 'contacts', path: '/lists', section: 'primary' },
  { key: 'buyops', label: 'Buy opps', icon: 'buyops', path: '/buyer-opportunities', buy: true, section: 'primary' },
  {
    key: 'reports', label: 'Reports', icon: 'reports', path: '/reports', section: 'primary',
    flyout: {
      head: 'Reports',
      items: [
        { label: 'Commission report', path: '/commission', icon: 'reports', adminOnly: true },
      ],
    },
  },
  { key: 'tasks', label: 'Tasks', icon: 'tasks', path: '/tasks', section: 'primary' },
  { key: 'salessheet', label: 'Sales sheet', icon: 'salessheet', path: '/sales-sheet', section: 'primary' },

  { key: 'evaluator', label: 'Evaluator', icon: 'evaluator', path: '/evaluator', section: 'tools' },
  { key: 'leads', label: 'Lead Intelligence', icon: 'leads', path: '/leads', section: 'tools' },
  { key: 'sales-command', label: 'Sales Command', icon: 'reports', path: '/sales-command', section: 'tools' },

  {
    key: 'settings', label: 'Settings', icon: 'settings', path: '/admin', adminOnly: true, section: 'admin',
    flyout: {
      head: 'Admin',
      items: [
        { label: 'Team & settings', path: '/admin', icon: 'settings', adminOnly: true },
        { label: 'HubSpot outbox', path: '/outbox', icon: 'outbox', adminOnly: true },
        { label: 'Lead approvals', path: '/lead-approvals', icon: 'approvals', adminOnly: true },
        { label: 'Commission report', path: '/commission', icon: 'reports', adminOnly: true },
        { label: 'Spine', path: '/spine', icon: 'spine', adminOnly: true },
      ],
    },
  },
]

// Section headings (rendered above the first item of each section)
export const SECTION_LABEL: Record<NavItem['section'], string> = {
  primary: '',
  tools: 'Tools',
  admin: 'Platform (admin only)',
}
