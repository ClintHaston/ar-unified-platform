import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { TOOL_URLS } from '../lib/config'

const TOOLS = [
  { path: '/evaluator',     tabKey: 'evaluator',    src: TOOL_URLS.evaluator,     title: 'AR Evaluator' },
  { path: '/deals-legacy',  tabKey: 'deals',         src: TOOL_URLS.deals,         title: 'AR Deals' },
  { path: '/leads',         tabKey: 'leads',         src: TOOL_URLS.leads,         title: 'AR Lead Intelligence' },
  { path: '/sales-command', tabKey: 'sales_command', src: TOOL_URLS.sales_command, title: 'AR Sales Command' },
]

function LiveFrame({ src, title, active }: { src: string; title: string; active: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (active && !started.current && ref.current) {
      ref.current.src = src
      started.current = true
    }
  }, [active, src])

  // Block all postMessages originating from this iframe — we don't use
  // cross-frame communication and the embedded tools (e.g. Manus Previewer)
  // send messages that would otherwise reach Vite HMR or other listeners.
  useEffect(() => {
    function block(event: MessageEvent) {
      if (ref.current?.contentWindow && event.source === ref.current.contentWindow) {
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('message', block, true)
    return () => window.removeEventListener('message', block, true)
  }, [])

  return (
    <div className="page-frame" style={{ display: active ? undefined : 'none' }}>
      <iframe ref={ref} title={title} allow="fullscreen" />
    </div>
  )
}

export function PersistentIframes() {
  const { pathname } = useLocation()
  const { user, loading } = useAuth()

  if (loading || !user || user.must_change_password) return null

  return (
    <>
      {TOOLS.map(tool => {
        if (!tool.src) return null
        return (
          <LiveFrame
            key={tool.tabKey}
            src={tool.src}
            title={tool.title}
            active={pathname === tool.path}
          />
        )
      })}
    </>
  )
}
