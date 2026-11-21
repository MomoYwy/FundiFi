import { useState } from 'react'

export type View = 'dashboard' | 'apply' | 'my-loans' | 'marketplace' | 'portfolio' | 'loan-detail' | 'insights' | 'compliance' | 'support'

const links: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '◫' },
  { id: 'apply', label: 'Apply for Loan', icon: '+' },
  { id: 'my-loans', label: 'My Loans', icon: '▤' },
  { id: 'marketplace', label: 'Marketplace', icon: '◇' },
  { id: 'portfolio', label: 'My Portfolio', icon: '▥' },
  { id: 'insights', label: 'AI Insights', icon: '✧' },
  { id: 'compliance', label: 'Compliance', icon: '◈' },
  { id: 'support', label: 'Help & Disputes', icon: '?' },
]

export function Sidebar({ view, setView, openInspector }: { view: View; setView: (view: View) => void; openInspector: () => void }) {
  const [mode, setMode] = useState<'borrower' | 'lender' | 'admin'>('borrower')
  return <aside className="sidebar">
    <div className="sidebar-brand"><span className="brand-mark">F</span><div><strong>FundiFi</strong><p>P2P micro-lending</p></div></div>
    <p className="sidebar-label">VIEW MODE</p><div className="mode-row">{(['borrower', 'lender', 'admin'] as const).map(item =>
      <button type="button" className={mode === item ? 'selected' : ''} aria-pressed={mode === item} key={item} onClick={() => { setMode(item); setView(item === 'borrower' ? 'dashboard' : item === 'lender' ? 'marketplace' : 'compliance') }}>{item}</button>)}</div>
    <p className="sidebar-hint">View mode does not grant permissions.</p>
    <p className="sidebar-label">NAVIGATION</p>
    <nav aria-label="Main navigation" className="navigation">
      {links.map(link => <button key={link.id} type="button" className={`nav-item${view === link.id ? ' active' : ''}`} aria-current={view === link.id ? 'page' : undefined} onClick={() => setView(link.id)}>
        <span aria-hidden="true" className="nav-icon">{link.icon}</span>{link.label}
      </button>)}
    </nav>
    <button className="inspector-button" type="button" onClick={openInspector}>◇ &nbsp;Contract inspector</button>
  </aside>
}
