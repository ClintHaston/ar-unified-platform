import { TOOL_URLS } from '../lib/config'

export function Leads() {
  if (!TOOL_URLS.leads) return (
    <div className="access-denied" style={{ paddingTop: 80 }}>
      <h2>Lead Intelligence</h2>
      <p>Set <code>VITE_LEADS_URL</code> in Vercel to embed this tool.</p>
    </div>
  )
  return null
}
