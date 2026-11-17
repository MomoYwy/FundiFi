import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, getHealth, predictRisk, type HealthResponse, type RiskResponse } from './api/client'
import { isAmountInTier, type LoanTier } from './loan'
import { useWallet } from './web3/WalletContext'
import { getConfig } from './web3/config'
import { eth, latestLoans, PENDING_RISK, quotePrincipal, readLoan, repaymentAmount, requestLoan, fundLoan, repayLoan, type Loan } from './web3/escrow'
import { useTransaction } from './web3/useTransaction'
import { TransactionStatus } from './web3/TransactionStatus'

type Assessment = { status: 'idle' | 'loading' } |
  { status: 'success'; result: RiskResponse; principal: bigint; account: string; chain: bigint } |
  { status: 'error'; message: string }

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function WalletHeader() {
  const { account, chainId, error, connecting, connect, disconnect } = useWallet()
  let networkMessage = ''
  try {
    const config = getConfig()
    if (account && chainId !== config.chainId) networkMessage = `Switch wallet to chain ${config.chainId}.`
  } catch (error) { networkMessage = message(error) }
  return <>
    <header className="topbar"><div className="brand"><span className="brand-mark">F</span> FundiFi</div><span className="top-label">Borrower & lender portal</span>
      <div className="wallet">{account ? <><span title={account}>{account.slice(0, 6)}…{account.slice(-4)}</span><button className="secondary" onClick={disconnect}>Disconnect</button></> :
        <button className="secondary" disabled={connecting} onClick={() => void connect()}>{connecting ? 'Connecting…' : 'Connect wallet'}</button>}</div>
    </header>
    {(error || networkMessage) && <p className="wallet-warning" role="alert">{error || networkMessage}</p>}
  </>
}

function Borrower({ onChanged }: { onChanged: () => void }) {
  const { account, chainId, getSigner } = useWallet()
  const [tier, setTier] = useState<LoanTier>('tier1')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('')
  const [velocity, setVelocity] = useState('')
  const [rate, setRate] = useState('')
  const [days, setDays] = useState('')
  const [assessment, setAssessment] = useState<Assessment>({ status: 'idle' })
  const generation = useRef(0)
  const transaction = useTransaction()
  const txBusy = transaction.state.status === 'signature' || transaction.state.status === 'pending'

  useEffect(() => {
    generation.current++
    setAssessment({ status: 'idle' })
  }, [account, chainId])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = ++generation.current
    const borrowFrequency = Number(frequency)
    const repaymentVelocity = Number(velocity)
    const rateBps = Number(rate)
    const duration = Number(days)
    if (!account || chainId === null) { setAssessment({ status: 'error', message: 'Connect your wallet first.' }); return }
    if (!isAmountInTier(Number(amount), tier)) { setAssessment({ status: 'error', message: 'Enter an amount within the selected tier.' }); return }
    if (frequency.trim() === '' || !Number.isInteger(borrowFrequency) || borrowFrequency < 0 || borrowFrequency > 1000 ||
      velocity.trim() === '' || !Number.isFinite(repaymentVelocity) || repaymentVelocity < 0 || repaymentVelocity > 1 ||
      rate.trim() === '' || !Number.isInteger(rateBps) || rateBps < 0 || rateBps > 5000 ||
      days.trim() === '' || !Number.isInteger(duration) || duration < 1 || duration > 3650) {
      setAssessment({ status: 'error', message: 'Check the history, annual interest rate and duration values.' })
      return
    }
    setAssessment({ status: 'loading' })
    try {
      const signer = await getSigner()
      const principal = await quotePrincipal(signer, amount, tier)
      const result = await predictRisk({ wallet_address: account, requested_amount: Number(amount), borrow_frequency: borrowFrequency, repayment_velocity: repaymentVelocity })
      if (current === generation.current) setAssessment({ status: 'success', result, principal, account, chain: chainId })
    } catch (error) {
      if (current === generation.current) setAssessment({ status: 'error', message: error instanceof ApiError ? error.message : message(error) })
    }
  }

  async function createLoan() {
    if (assessment.status !== 'success' || !assessment.result.approved || assessment.account !== account || assessment.chain !== chainId) return
    const snapshot = assessment
    const ok = await transaction.run(async () => {
      const signer = await getSigner()
      const principal = await quotePrincipal(signer, amount, tier)
      if (principal !== snapshot.principal) throw new Error('The principal quote changed. Assess again before submitting.')
      return requestLoan(signer, principal, Number(rate), Number(days), tier)
    })
    if (ok) { generation.current++; setAssessment({ status: 'idle' }); onChanged() }
  }
  const loading = assessment.status === 'loading'
  return <section className="card">
    <span className="eyebrow">BORROWER</span><h2>Request a loan</h2>
    <p className="muted">Get an advisory assessment, then submit a loan request for one lender to fund in full.</p>
    <form onSubmit={submit} onChange={() => { generation.current++; setAssessment({ status: 'idle' }) }}>
      <fieldset disabled={loading || txBusy}>
        <label htmlFor="tier">Loan tier</label><select id="tier" value={tier} onChange={event => setTier(event.target.value as LoanTier)}><option value="tier1">Tier 1 · RM 500–3,000</option><option value="tier2">Tier 2 · RM 3,001–15,000</option></select>
        <label htmlFor="amount">Requested amount (RM)</label><input id="amount" type="number" step="0.01" min={tier === 'tier1' ? 500 : 3001} max={tier === 'tier1' ? 3000 : 15000} required value={amount} onChange={event => setAmount(event.target.value)} />
        <div className="input-grid">
          <div><label htmlFor="rate">Annual interest (basis points)</label><input id="rate" type="number" min="0" max="5000" step="1" required value={rate} onChange={event => setRate(event.target.value)} /><p className="hint">100 basis points = 1% APR; maximum 50%.</p></div>
          <div><label htmlFor="days">Duration (days)</label><input id="days" type="number" min="1" max="3650" step="1" required value={days} onChange={event => setDays(event.target.value)} /></div>
          <div><label htmlFor="frequency">Borrow frequency</label><input id="frequency" type="number" min="0" max="1000" step="1" required value={frequency} onChange={event => setFrequency(event.target.value)} /><p className="hint">Loans in the last 90 days.</p></div>
          <div><label htmlFor="velocity">Repayment velocity</label><input id="velocity" type="number" min="0" max="1" step="any" required value={velocity} onChange={event => setVelocity(event.target.value)} /><p className="hint">Share repaid on time or early, 0 to 1.</p></div>
        </div>
        <p className="notice">History is self-reported and unverified. The model uses synthetic training data and is not a loan approval or identity check.</p>
        <button className="primary" type="submit" disabled={!account}>{loading ? 'Assessing risk…' : 'Get risk assessment'} <span aria-hidden="true">→</span></button>
      </fieldset>
    </form>
    {assessment.status === 'error' && <p className="error" role="alert">{assessment.message}</p>}
    {assessment.status === 'success' && <div className="result" aria-live="polite">
      <h2>Risk overview</h2><p className="score">{assessment.result.risk_score.toFixed(4)}</p>
      <p>Risk category: <strong>{assessment.result.risk_category}</strong></p>
      <p>Model advisory: <strong>{assessment.result.approved ? 'Eligible according to model' : 'Not eligible according to model'}</strong></p>
      <p>Contract principal: <strong>{eth(assessment.principal)} native tokens</strong></p>
      <p className="hint">A request is not an approval. The API does not provide a risk hash; a separate trusted oracle must attest the request before funding. This UI cannot submit that attestation.</p>
      {assessment.result.approved && <button className="primary action" type="button" disabled={txBusy} onClick={() => void createLoan()}>Request loan on-chain</button>}
    </div>}
    <TransactionStatus state={transaction.state} />
  </section>
}

function Marketplace({ version, onChanged }: { version: number; onChanged: () => void }) {
  const { account, chainId, getSigner } = useWallet()
  const [loans, setLoans] = useState<Loan[]>([])
  const [selected, setSelected] = useState<Loan | null>(null)
  const [id, setId] = useState('')
  const [due, setDue] = useState<bigint | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const transaction = useTransaction()
  const txBusy = transaction.state.status === 'signature' || transaction.state.status === 'pending'
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    setLoans([]); setSelected(null); setDue(null); setError('')
    if (!account) { setLoading(false); return }
    setLoading(true)
    getSigner().then(latestLoans).then(data => {
      if (current === generation.current) { setLoans(data); setLoading(false) }
    }, err => { if (current === generation.current) { setError(message(err)); setLoading(false) } })
    return () => { generation.current++ }
  }, [account, chainId, getSigner, refresh, version])

  async function inspect(loanId: string) {
    const current = ++generation.current
    setSelected(null); setDue(null); setError(''); setLoading(true)
    try {
      if (!/^[1-9]\d*$/.test(loanId)) throw new Error('Enter a positive loan ID.')
      const signer = await getSigner()
      const loan = await readLoan(signer, BigInt(loanId))
      const amountDue = loan.state === 1n ? await repaymentAmount(signer, loan.id) : null
      if (current === generation.current) { setSelected(loan); setDue(amountDue); setLoading(false) }
    } catch (err) { if (current === generation.current) { setError(message(err)); setLoading(false) } }
  }
  async function transact(action: 'fund' | 'repay') {
    if (!selected) return
    const id = selected.id
    const ok = await transaction.run(async () => {
      const signer = await getSigner()
      if (action === 'fund') return fundLoan(signer, id, selected.principal)
      if (due === null) throw new Error('Refresh the loan before repayment.')
      return repayLoan(signer, id, due)
    })
    if (ok) { onChanged(); setRefresh(value => value + 1) }
  }

  return <section className="card">
    <div className="card-header"><div><span className="eyebrow">ON-CHAIN LOANS</span><h2>Marketplace & repayment</h2></div><button className="secondary" disabled={!account || loading || txBusy} onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
    <p className="hint">Showing the latest 30 requests. Select a loan or look up any ID. Funding is all-or-nothing; repayment is a single full payment.</p>
    {!account ? <p className="muted">Connect a wallet to view loans.</p> : loading ? <p className="muted">Loading on-chain data…</p> : <>
      {loans.length === 0 && <p className="muted">No loans found.</p>}
      <div className="loan-list">{loans.map(loan => <button className="loan-item" key={loan.id.toString()} onClick={() => { setId(loan.id.toString()); void inspect(loan.id.toString()) }} disabled={txBusy}>#{loan.id.toString()} · {eth(loan.principal)} native tokens · {['Requested', 'Active', 'Repaid', 'Defaulted'][Number(loan.state)] || 'Unknown'}</button>)}</div>
    </>}
    <form onSubmit={event => { event.preventDefault(); void inspect(id) }}><label htmlFor="loan-id">Loan ID</label><div className="lookup"><input id="loan-id" inputMode="numeric" value={id} onChange={event => setId(event.target.value)} /><button className="secondary" disabled={!account || loading || txBusy}>View</button></div></form>
    {error && <p className="error" role="alert">{error}</p>}
    {selected && <div className="loan-detail">
      <h2>Loan #{selected.id.toString()}</h2>
      <p>State: {['Requested', 'Active', 'Repaid', 'Defaulted'][Number(selected.state)] || 'Unknown'}</p>
      <p>Borrower: <span className="hash">{selected.borrower}</span></p>
      <p>Principal: {eth(selected.principal)} native tokens</p>
      <p>APR: {(Number(selected.interestRate) / 100).toFixed(2)}% · Duration: {Number(selected.duration) / 86400} days</p>
      <p>Oracle assessment: {selected.riskScore === PENDING_RISK ? 'Pending' : `Attested score ${eth(selected.riskScore)} (not an approval)`}</p>
      {selected.riskScore !== PENDING_RISK && <p className="hint">The contract accepts any attested score for funding; an attestation does not enforce loan approval or verify identity.</p>}
      {selected.state === 0n && selected.riskScore !== PENDING_RISK && account?.toLowerCase() !== selected.borrower.toLowerCase() && <button className="primary action" disabled={txBusy} onClick={() => void transact('fund')}>Fund full {eth(selected.principal)} native tokens</button>}
      {selected.state === 1n && due !== null && <p>Full amount due: {eth(due)} native tokens</p>}
      {selected.state === 1n && due !== null && account?.toLowerCase() === selected.borrower.toLowerCase() && <button className="primary action" disabled={txBusy} onClick={() => void transact('repay')}>Repay full {eth(due)} native tokens</button>}
    </div>}
    <TransactionStatus state={transaction.state} />
  </section>
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState('')
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthVersion, setHealthVersion] = useState(0)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let active = true
    getHealth().then(
      data => { if (active) { setHealth(data); setHealthError(''); setHealthLoading(false) } },
      error => { if (active) { setHealth(null); setHealthError(message(error)); setHealthLoading(false) } },
    )
    return () => { active = false }
  }, [healthVersion])
  return <div className="app"><WalletHeader /><main>
    <div className="heading"><span className="eyebrow">BORROW WITH CONFIDENCE</span><h1>Explore your loan options</h1><p>Risk assessment and single-lender escrow transactions.</p></div>
    <div className="layout"><Borrower onChanged={() => setVersion(value => value + 1)} /><aside><Marketplace version={version} onChanged={() => setVersion(value => value + 1)} />
      <section className="card health" aria-live="polite"><div><span className="eyebrow">API STATUS</span><p>{healthLoading ? 'Checking service…' : healthError || (health?.models_loaded ? 'Service available · models loaded' : 'Service available · models not loaded')}</p></div><button type="button" className="secondary" onClick={() => { setHealthLoading(true); setHealthVersion(value => value + 1) }}>Refresh</button></section>
    </aside></div>
  </main></div>
}
