// Curated inline icon set for the app shell. One consistent family: 24-unit
// viewBox, 1.5 stroke, round caps/joins, currentColor — so icons inherit nav
// state colors. Kept dependency-free to match this codebase's zero-UI-lib
// approach; consistency (not hand-waving) is the point.

export type IconName =
  | 'dashboard' | 'pipeline' | 'inventory' | 'contacts' | 'company' | 'deal'
  | 'offer' | 'buyops' | 'reports' | 'tasks' | 'settings' | 'salessheet'
  | 'evaluator' | 'leads' | 'command' | 'outbox' | 'approvals' | 'spine'
  | 'search' | 'plus' | 'note' | 'chevron-right' | 'chevron-down'
  | 'chevron-left' | 'panel' | 'clock' | 'activity' | 'sparkle' | 'intake'

const P: Record<IconName, JSX.Element> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  pipeline: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="16" y="4" width="5" height="7" rx="1.5" /></>,
  inventory: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  contacts: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 6.5a3 3 0 0 1 0 5.8M17.5 20a5.2 5.2 0 0 0-3-4.7" /></>,
  company: <><rect x="4" y="3" width="10" height="18" rx="1.5" /><path d="M14 8h5a1.5 1.5 0 0 1 1.5 1.5V21" /><path d="M7 7h4M7 11h4M7 15h4M17 12h1M17 16h1" /></>,
  deal: <><path d="M7 3h7l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V4.5A1.5 1.5 0 0 1 7 3z" /><path d="M13 3v4h4M9 13h6M9 17h4" /></>,
  offer: <><path d="M3.5 12.5 11 5a2 2 0 0 1 1.4-.6H19a1.5 1.5 0 0 1 1.5 1.5v6.6a2 2 0 0 1-.6 1.4l-7.5 7.5a1.5 1.5 0 0 1-2.1 0L3.5 14.6a1.5 1.5 0 0 1 0-2.1z" /><circle cx="16" cy="8" r="1.3" /></>,
  buyops: <><path d="M4 13l4.5 4.5a2 2 0 0 0 2.8 0l6-6a2 2 0 0 0 0-2.8L12.8 4.2" /><path d="M9 8l3 3M6.5 5.5l3 3" /><circle cx="5" cy="6" r="1.2" /></>,
  reports: <><path d="M4 20h16" /><path d="M7 20V11M12 20V5M17 20v-6" /></>,
  tasks: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="m8.5 12 2.3 2.3L15.5 9.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" /></>,
  salessheet: <><rect x="5" y="3" width="14" height="18" rx="1.8" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></>,
  evaluator: <><rect x="5" y="3" width="14" height="18" rx="1.8" /><path d="M8.5 7h7M8.5 11h1.5M13 11h2.5M8.5 15h1.5M13 15h2.5M8.5 18.5h1.5" /></>,
  leads: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  command: <><path d="M9 6a1.5 1.5 0 1 0-1.5 1.5H9zm0 0v3m0 3v3a1.5 1.5 0 1 1-1.5-1.5H9zm0 0h3m3 0h.5A1.5 1.5 0 1 1 15 18v-.5zm0 0v-3m0-3V6a1.5 1.5 0 1 1 1.5 1.5H15zm0 0h-3M9 9h6v6H9z" /></>,
  outbox: <><path d="M4 12h6M20 12l-8-7v4c-5 0-8 3-8 9 1.8-2.6 4-3.9 8-3.9V18z" /></>,
  approvals: <><path d="M6 4h9l4 4v10a1.8 1.8 0 0 1-1.8 1.8H6A1.8 1.8 0 0 1 4.2 18V5.8A1.8 1.8 0 0 1 6 4z" /><path d="M14 4v4h4M8.5 13l2 2 3.5-3.5" /></>,
  spine: <><rect x="3.5" y="4" width="17" height="6" rx="1.5" /><rect x="3.5" y="14" width="17" height="6" rx="1.5" /><path d="M7 7h.01M7 17h.01" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  note: <><path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16H9l-4 4V6.5A1.5 1.5 0 0 1 6.5 5z" /><path d="M8.5 9.5h7M8.5 12.5h4" /></>,
  intake: <><path d="M12 3v11m0 0 4-4m-4 4-4-4" /><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" /></>,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></>,
  activity: <><path d="M3 12h4l2.5-6 5 12L17 12h4" /></>,
  sparkle: <><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /></>,
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  )
}
