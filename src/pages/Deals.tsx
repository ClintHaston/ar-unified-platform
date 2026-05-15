import { TOOL_URLS } from '../lib/config'
import { ToolFrame } from './ToolFrame'

export function Deals() {
  if (!TOOL_URLS.deals) return <NotDeployed name="Deals (ARBP)" />
  return <ToolFrame src={TOOL_URLS.deals} title="AR Deals" />
}

function NotDeployed({ name }: { name: string }) {
  return (
    <div className="access-denied" style={{ paddingTop: 80 }}>
      <h2>{name}</h2>
      <p>Set <code>VITE_DEALS_URL</code> in <code>.env.local</code> to embed this tool.</p>
    </div>
  )
}
