import { TOOL_URLS } from '../lib/config'

export function Deals() {
  if (!TOOL_URLS.deals) return (
    <div className="access-denied" style={{ paddingTop: 80 }}>
      <h2>Deals (ARBP)</h2>
      <p>Set <code>VITE_DEALS_URL</code> in Vercel to embed this tool.</p>
    </div>
  )
  return null
}
