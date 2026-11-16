import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, getHealth, predictRisk, type HealthResponse, type RiskResponse } from './api/client'
import { isAmountInTier, type LoanTier } from './loan'

type Assessment = { status: 'idle' | 'loading' } |
  { status: 'success'; result: RiskResponse } |
  { status: 'error'; message: string }

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : 'An unexpected error occurred.'
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [healthError, setHealthError] = useState('')
  const [healthLoading, setHealthLoading] = useState(true)
  const [healthVersion, setHealthVersion] = useState(0)
  const [tier, setTier] = useState<LoanTier>('tier1')
  const [amount, setAmount] = useState('')
  const [wallet, setWallet] = useState('')
  const [frequency, setFrequency] = useState('')
  const [velocity, setVelocity] = useState('')
  const [assessment, setAssessment] = useState<Assessment>({ status: 'idle' })

  useEffect(() => {
    let active = true
    getHealth().then(
      data => { if (active) { setHealth(data); setHealthError(''); setHealthLoading(false) } },
      error => { if (active) { setHealth(null); setHealthError(message(error)); setHealthLoading(false) } },
    )
    return () => { active = false }
  }, [healthVersion])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const requestedAmount = Number(amount)
    const borrowFrequency = Number(frequency)
    const repaymentVelocity = Number(velocity)
    if (!isAmountInTier(requestedAmount, tier)) {
      setAssessment({ status: 'error', message: 'Enter an amount within the selected tier. Amounts between RM 3,000 and RM 3,001 are not supported.' })
      return
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet.trim()) ||
        frequency.trim() === '' || !Number.isInteger(borrowFrequency) || borrowFrequency < 0 || borrowFrequency > 1000 ||
        velocity.trim() === '' || !Number.isFinite(repaymentVelocity) || repaymentVelocity < 0 || repaymentVelocity > 1) {
      setAssessment({ status: 'error', message: 'Check the wallet address and history values before requesting an assessment.' })
      return
    }
    setAssessment({ status: 'loading' })
    try {
      const result = await predictRisk({
        wallet_address: wallet.trim(), requested_amount: requestedAmount,
        borrow_frequency: borrowFrequency, repayment_velocity: repaymentVelocity,
      })
      setAssessment({ status: 'success', result })
    } catch (error) {
      setAssessment({ status: 'error', message: message(error) })
    }
  }

  const loading = assessment.status === 'loading'
  return (
    <div className="app">
      <header className="topbar"><div className="brand"><span className="brand-mark">F</span> FundiFi</div><span className="top-label">Borrower portal</span><span className="preview">API assessment only</span></header>
      <main>
        <div className="heading"><span className="eyebrow">BORROW WITH CONFIDENCE</span><h1>Explore your loan options</h1><p>Request an off-chain risk assessment before any loan application or transaction.</p></div>
        <div className="layout">
          <section className="card">
            <div className="card-header"><div><span className="eyebrow">01 / RISK ASSESSMENT</span><h2>Loan details</h2></div><span className="badge">Off-chain</span></div>
            <p className="muted">Choose your loan tier and enter the information required by the risk API.</p>
            <form onSubmit={submit} onChange={() => { if (!loading) setAssessment({ status: 'idle' }) }}>
              <fieldset disabled={loading}>
                <label htmlFor="tier">Loan tier</label>
                <select id="tier" value={tier} onChange={event => setTier(event.target.value as LoanTier)}>
                  <option value="tier1">Tier 1 · RM 500–3,000</option><option value="tier2">Tier 2 · RM 3,001–15,000</option>
                </select>
                <label htmlFor="amount">Requested amount (RM)</label>
                <input id="amount" type="number" step="0.01" min={tier === 'tier1' ? 500 : 3001} max={tier === 'tier1' ? 3000 : 15000} required value={amount} onChange={event => setAmount(event.target.value)} placeholder="Enter amount" />
                <label htmlFor="wallet">Wallet address</label>
                <input id="wallet" type="text" required pattern="0x[a-fA-F0-9]{40}" autoComplete="off" spellCheck={false} value={wallet} onChange={event => setWallet(event.target.value)} placeholder="0x…" />
                <p className="hint">Entered manually for the API; ownership is not verified. Wallet connection is not implemented.</p>
                <div className="input-grid">
                  <div><label htmlFor="frequency">Borrow frequency</label><input id="frequency" type="number" min="0" max="1000" step="1" required value={frequency} onChange={event => setFrequency(event.target.value)} placeholder="Number of loans" /><p className="hint">Loans in the last 90 days.</p></div>
                  <div><label htmlFor="velocity">Repayment velocity</label><input id="velocity" type="number" min="0" max="1" step="any" required value={velocity} onChange={event => setVelocity(event.target.value)} placeholder="0 to 1" /><p className="hint">Share repaid on time or early.</p></div>
                </div>
                <p className="notice">History is self-reported and unverified. Do not treat this assessment as a credit decision. Enter these values only if you know them.</p>
                <button className="primary" type="submit">{loading ? 'Assessing risk…' : 'Get risk assessment'} <span aria-hidden="true">→</span></button>
              </fieldset>
            </form>
            {assessment.status === 'error' && <p className="error" role="alert">{assessment.message}</p>}
          </section>
          <aside>
            <section className="card result" aria-live="polite">
              <span className="eyebrow">02 / YOUR ASSESSMENT</span><h2>Risk overview</h2>
              {assessment.status === 'success' ? <>
                <p className="score">{assessment.result.risk_score.toFixed(4)}</p>
                <p>Risk category: <strong>{assessment.result.risk_category}</strong></p>
                <p>Model advisory: <strong>{assessment.result.approved ? 'Eligible according to model' : 'Not eligible according to model'}</strong></p>
                <p className="hint">This is not loan approval, proof of identity, or an on-chain risk attestation. Additional business rules and trusted verification are required.</p>
              </> : <p className="muted">{loading ? 'Waiting for the risk API…' : 'Your API result will appear here after you request an assessment.'}</p>}
            </section>
            <section className="card"><span className="eyebrow">HOW IT WORKS</span><h2>Simple by design</h2>
              <div className="step"><span>01</span><p><strong>One lender</strong><br />A single lender funds the full principal.</p></div>
              <div className="step"><span>02</span><p><strong>One repayment</strong><br />The borrower repays the full principal plus interest, not monthly installments.</p></div>
              <div className="step"><span>03</span><p><strong>Transactions later</strong><br />Wallets, funding and repayment are not connected in this phase.</p></div>
            </section>
            <section className="card health" aria-live="polite"><div><span className="eyebrow">API STATUS</span><p>{healthLoading ? 'Checking service…' : healthError || (health?.models_loaded ? 'Service available · models loaded' : 'Service available · models not loaded')}</p></div><button type="button" className="secondary" onClick={() => { setHealthLoading(true); setHealthVersion(value => value + 1) }}>Refresh</button></section>
          </aside>
        </div>
      </main>
    </div>
  )
}
