import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, predictRisk, type RiskResponse } from '../api/client'
import { isAmountInTier, type LoanTier } from '../loan'
import { useWallet } from '../web3/WalletContext'
import { eth, quotePrincipal, requestLoan } from '../web3/escrow'
import { useTransaction } from '../web3/useTransaction'
import { TransactionStatus } from '../web3/TransactionStatus'

type Assessment = { status: 'idle' } |
  { status: 'loading'; account: string; chain: bigint } |
  { status: 'success'; result: RiskResponse; principal: bigint; account: string; chain: bigint } |
  { status: 'error'; message: string }

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export function LoanApplication({ onChanged }: { onChanged: () => void }) {
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
    setAssessment({ status: 'loading', account, chain: chainId })
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

  const loading = assessment.status === 'loading' && assessment.account === account && assessment.chain === chainId
  const assessmentMatchesWallet = assessment.status === 'success' && assessment.account === account && assessment.chain === chainId
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
    {assessmentMatchesWallet && assessment.status === 'success' && <div className="result" aria-live="polite">
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
