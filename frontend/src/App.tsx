import { useEffect, useState } from 'react'
import { getHealth, type HealthResponse } from './api/client'
import { useWallet } from './web3/WalletContext'
import { getConfig } from './web3/config'
import { BorrowerDashboard } from './components/BorrowerDashboard'
import { LoanApplication } from './components/LoanApplication'
import { Marketplace } from './components/Marketplace'
import { LenderPortal } from './components/LenderPortal'
import { LoanDetail } from './components/LoanDetail'
import { Sidebar, type View } from './components/Sidebar'
import { WalletModal } from './components/WalletModal'
import { ActivityDrawer } from './components/ActivityDrawer'
import { ContractInspector } from './components/ContractInspector'
import { UnavailableView } from './components/UnavailableView'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function WalletHeader({ openWallet, openActivity }: { openWallet: () => void; openActivity: () => void }) {
  const { account, chainId, error } = useWallet()
  let networkMessage = ''
  try {
    const config = getConfig()
    if (account && chainId !== config.chainId) networkMessage = `Switch wallet to chain ${config.chainId}.`
  } catch (reason) { networkMessage = message(reason) }
  return <>
    <header className="topbar"><div className="brand mobile-brand"><span className="brand-mark">F</span> FundiFi</div><span className="top-label">Borrower & lender portal</span>
      <div className="wallet"><button className="secondary" onClick={openActivity}>Activity & alerts</button><button className="secondary" title={account || undefined} onClick={openWallet}>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect wallet'}</button></div>
    </header>
    {(error || networkMessage) && <p className="wallet-warning" role="alert">{error || networkMessage}</p>}
  </>
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState('')
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthVersion, setHealthVersion] = useState(0)
  const [version, setVersion] = useState(0)
  const [view, setView] = useState<View>('dashboard')
  function navigate(next: View) { setView(next) }
  const [loanOrigin, setLoanOrigin] = useState<View>('marketplace')
  const [selectedLoanId, setSelectedLoanId] = useState<bigint | null>(null)
  const [dialog, setDialog] = useState<'wallet' | 'activity' | 'inspector' | null>(null)
  function openLoan(id: bigint, origin: View) {
    setSelectedLoanId(id)
    setLoanOrigin(origin)
    navigate('loan-detail')
  }

  useEffect(() => {
    let active = true
    getHealth().then(
      data => { if (active) { setHealth(data); setHealthError(''); setHealthLoading(false) } },
      error => { if (active) { setHealth(null); setHealthError(message(error)); setHealthLoading(false) } },
    )
    return () => { active = false }
  }, [healthVersion])

  return <div className="app-shell">
    <Sidebar view={view === 'loan-detail' ? loanOrigin : view} setView={navigate} openInspector={() => setDialog('inspector')} />
    <div className="app-content"><WalletHeader openWallet={() => setDialog('wallet')} openActivity={() => setDialog('activity')} /><main>
      {view === 'dashboard' && <>
        <BorrowerDashboard version={version} onApply={() => navigate('apply')} onMyLoans={() => navigate('my-loans')} onMarketplace={() => navigate('marketplace')} onSelect={id => openLoan(id, 'my-loans')} />
        <section className="card health health-card" aria-live="polite"><div><span className="eyebrow">API STATUS</span><p>{healthLoading ? 'Checking service…' : healthError || (health?.models_loaded ? 'Service available · models loaded' : 'Service available · models not loaded')}</p></div><button type="button" className="secondary" onClick={() => { setHealthLoading(true); setHealthVersion(value => value + 1) }}>Refresh</button></section>
      </>}
      <div hidden={view !== 'apply'}><LoanApplication onChanged={() => setVersion(value => value + 1)} /></div>
      <div hidden={view !== 'marketplace'}><Marketplace active={view === 'marketplace'} version={version} onSelect={id => openLoan(id, 'marketplace')} /></div>
      <div hidden={view !== 'my-loans'}><Marketplace active={view === 'my-loans'} version={version} onSelect={id => openLoan(id, 'my-loans')} scope="borrower" /></div>
      <div hidden={view !== 'portfolio'}><LenderPortal active={view === 'portfolio'} version={version} onSelect={id => openLoan(id, 'portfolio')} /></div>
      <div hidden={view !== 'loan-detail'}><LoanDetail active={view === 'loan-detail'} id={selectedLoanId} version={version} onBack={() => navigate(loanOrigin)} onChanged={() => setVersion(value => value + 1)} /></div>
      <UnavailableView view={view} />
    </main></div>
    {dialog === 'wallet' && <WalletModal onClose={() => setDialog(null)} />}
    {dialog === 'activity' && <ActivityDrawer onClose={() => setDialog(null)} />}
    {dialog === 'inspector' && <ContractInspector onClose={() => setDialog(null)} />}
  </div>
}
