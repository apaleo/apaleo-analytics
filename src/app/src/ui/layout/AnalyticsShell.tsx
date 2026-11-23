import type { ReactNode } from 'react'
import './shell.css'

export function AnalyticsShell({
  sidebar,
  topBar,
  rightPanel,
  children,
}: {
  sidebar: ReactNode
  topBar: ReactNode
  rightPanel?: ReactNode
  children: ReactNode
}) {
  const className = rightPanel == null ? 'shell' : 'shell shell--panel'
  return (
    <div className={className}>
      <aside className="shell__nav">{sidebar}</aside>
      <div className="shell__top">{topBar}</div>
      <main className="shell__main">
        <div id="chart-export" className="chart-export">
          {children}
        </div>
      </main>
      {rightPanel == null ? null : <aside className="shell__panel">{rightPanel}</aside>}
    </div>
  )
}
