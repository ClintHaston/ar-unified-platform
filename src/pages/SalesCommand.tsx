import { TOOL_URLS } from '../lib/config'

export function SalesCommand() {
  if (!TOOL_URLS.sales_command) return (
    <div className="access-denied" style={{ paddingTop: 80 }}>
      <h2>Sales Command</h2>
      <p>Set <code>VITE_SALES_COMMAND_URL</code> in Vercel to embed this tool.</p>
    </div>
  )
  return null
}
