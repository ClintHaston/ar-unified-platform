import { TOOL_URLS } from '../lib/config'
import { ToolFrame } from './ToolFrame'

export function SalesCommand() {
  if (!TOOL_URLS.sales_command) return <NotDeployed />
  return <ToolFrame src={TOOL_URLS.sales_command} title="AR Sales Command" />
}

function NotDeployed() {
  return (
    <div className="access-denied" style={{ paddingTop: 80 }}>
      <h2>Sales Command</h2>
      <p>Set <code>VITE_SALES_COMMAND_URL</code> in <code>.env.local</code> to embed this tool.</p>
    </div>
  )
}
