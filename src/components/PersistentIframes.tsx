import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { TOOL_URLS } from '../lib/config'

const TOOLS = [
  { path: '/evaluator',     tabKey: 'evaluator',    src: TOOL_URLS.evaluator,     title: 'AR Evaluator' },
  { path: '/deals',         tabKey: 'deals',         src: TOOL_URLS.deals,         title: 'AR Deals' },
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

  return (
    <div className="page-frame" style={{ display: active ? undefined : 'none' }}>
      <iframe ref={ref} title={title} allow="fullscreen" />
    </div>
  )
}

export function PersistentIframes() {
  const { pathname } = useLocation()
  const { user, permissions, loading } = useAuth()

  if (loading || !user) return null

  return (
    <>
      {TOOLS.map(tool => {
        if (!tool.src || !permissions[tool.tabKey]) return null
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
