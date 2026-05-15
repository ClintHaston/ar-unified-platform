import { TOOL_URLS } from '../lib/config'
import { ToolFrame } from './ToolFrame'

export function Leads() {
  if (!TOOL_URLS.leads) return <NotDeployed />
  return <ToolFrame src={TOOL_URLS.leads} title="AR Lead Intelligence" />
}

function NotDeployed() {
  return (
    <div className="access-denied" style={{ paddingTop: 80 }}>
      <h2>Lead Intelligence</h2>
      <p>Set <code>VITE_LEADS_URL</code> in <code>.env.local</code> to embed this tool.</p>
    </div>
  )
}
