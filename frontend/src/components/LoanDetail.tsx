import { useEffect, useRef, useState } from 'react'
import { LoanEvents } from '../web3/LoanEvents'
import { useTransaction } from '../web3/useTransaction'
import { TransactionStatus } from '../web3/TransactionStatus'
import { eth, fundLoan, PENDING_RISK, readLoan, repaymentAmount, repayLoan, type Loan } from '../web3/escrow'
import { useWallet } from '../web3/WalletContext'

type DetailState = { status: 'idle' } |
  { status: 'success'; key: string; loan: Loan; due: bigint | null } |
  { status: 'error'; key: string; message: string }

export function LoanDetail({ id, version, onBack, onChanged, active = true }: {
  id: bigint | null
  version: number
  onBack: () => void
  onChanged: () => void
  active?: boolean
}) {
  const { account, chainId, getSigner } = useWallet()
  const [state, setState] = useState<DetailState>({ status: 'idle' })
  const generation = useRef(0)
  const transaction = useTransaction()
  const busy = transaction.state.status === 'signature' || transaction.state.status === 'pending'
  const requestKey = `${id?.toString() ?? ''}:${account ?? ''}:${chainId?.toString() ?? ''}:${version}`

  useEffect(() => {
    const requestGeneration = generation
    const current = ++generation.current
    if (!active) return () => { requestGeneration.current++ }
    if (id === null || !account || chainId === null) return () => { requestGeneration.current++ }
    getSigner().then(async signer => {
      const loan = await readLoan(signer, id)
      const due = loan.state === 1n ? await repaymentAmount(signer, id) : null
      return { loan, due }
    }).then(result => {
      if (current === generation.current) setState({ status: 'success', key: requestKey, ...result })
    }, error => {
      if (current === generation.current) setState({ status: 'error', key: requestKey, message: error instanceof Error ? error.message : 'Could not load loan details.' })
    })
    return () => { requestGeneration.current++ }
  }, [active, id, account, chainId, getSigner, version, requestKey])

  const currentState = active && state.status !== 'idle' && state.key === requestKey ? state : null
  const loading = active && id !== null && !!account && chainId !== null && currentState === null

  async function transact(action: 'fund' | 'repay', loan: Loan, due: bigint | null) {
    const ok = await transaction.run(async () => {
      const signer = await getSigner()
      if (action === 'fund') return fundLoan(signer, loan.id, loan.principal)
      if (due === null) throw new Error('Refresh the loan before repayment.')
      return repayLoan(signer, loan.id, due)
    })
    if (ok) onChanged()
  }

  return <section className="card">
    <div className="card-header"><div><span className="eyebrow">ON-CHAIN LOAN</span><h2>Loan details</h2></div><button className="secondary" onClick={onBack}>Back to loans</button></div>
    {id === null && <p className="muted">Select a loan or enter a loan ID to view its on-chain details.</p>}
    {id !== null && !account && <p className="muted">Connect a wallet to read loan details.</p>}
    {loading && <p className="muted" role="status">Loading loan details…</p>}
    {currentState?.status === 'error' && <p className="error" role="alert">Could not load loan: {currentState.message}</p>}
    {currentState?.status === 'success' && <div className="loan-detail">
      <h3>Loan #{currentState.loan.id.toString()}</h3>
      <p>State: {['Requested', 'Active', 'Repaid', 'Defaulted'][Number(currentState.loan.state)] || 'Unknown'}</p>
      <p>Borrower: <span className="hash">{currentState.loan.borrower}</span></p>
      <p>Lender: <span className="hash">{currentState.loan.lender === '0x0000000000000000000000000000000000000000' ? 'Not funded' : currentState.loan.lender}</span></p>
      <p>Principal: {eth(currentState.loan.principal)} native tokens</p>
      <p>APR: {(Number(currentState.loan.interestRate) / 100).toFixed(2)}% · Duration: {Number(currentState.loan.duration) / 86400} days</p>
      <p>Oracle assessment: {currentState.loan.riskScore === PENDING_RISK ? 'Pending' : `Attested score ${eth(currentState.loan.riskScore)} (not an approval)`}</p>
      <p className="hint">The escrow uses one lender, exact full-principal funding, and a single full repayment. No installment or partial funding actions are supported.</p>
      {currentState.loan.state === 0n && currentState.loan.riskScore !== PENDING_RISK && account?.toLowerCase() !== currentState.loan.borrower.toLowerCase() &&
        <button className="primary action" disabled={busy} onClick={() => void transact('fund', currentState.loan, currentState.due)}>Fund full {eth(currentState.loan.principal)} native tokens</button>}
      {currentState.loan.state === 1n && currentState.due !== null && <p>Full amount due: {eth(currentState.due)} native tokens</p>}
      {currentState.loan.state === 1n && currentState.due !== null && account?.toLowerCase() === currentState.loan.borrower.toLowerCase() &&
        <button className="primary action" disabled={busy} onClick={() => void transact('repay', currentState.loan, currentState.due)}>Repay full {eth(currentState.due)} native tokens</button>}
      <LoanEvents key={`${chainId}-${account}-${currentState.loan.id}`} loanId={currentState.loan.id} />
    </div>}
    <TransactionStatus state={transaction.state} />
  </section>
}
