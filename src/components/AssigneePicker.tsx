import { useEffect, useState } from 'react'
import { api, type OwnerOption } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

// P1: task assignee picker (active users). Default = self ('' value). Not
// admin-gated — any active rep may assign a task to any active rep. Reused by
// the deal and contact task-create forms.
interface AssigneePickerProps {
  value: string
  onChange: (id: string) => void
  className?: string
}

export function AssigneePicker({ value, onChange, className }: AssigneePickerProps) {
  const { user } = useAuth()
  const [owners, setOwners] = useState<OwnerOption[]>([])

  useEffect(() => {
    api.contactOwners()
      .then((res) => setOwners(res.owners.filter((o) => o.is_active)))
      .catch(() => setOwners([]))
  }, [])

  return (
    <select
      className={className ?? 'plat-input'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Assign to"
    >
      <option value="">Assign to me ({user?.name})</option>
      {owners.filter((o) => o.id !== user?.id).map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  )
}
