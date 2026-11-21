import { useEffect, useRef, useState, type FormEvent } from 'react'
import { eth, latestLoans, type Loan } from '../web3/escrow'
import { useWallet } from '../web3/WalletContext'

export type LoanListScope = 'all' | 'borrower' | 'lender'
type ReadState = { status: 'idle' } |
  { status: 'success'; key: string; loans: Loan[] } |
  { status: 'error'; key: string; message: string }

export function LoanList({ scope, version, onSelect, active = true }: {
  scope: LoanListScope
  version: number
  onSelect: (id: bigint) => void
  active?: boolean
}) {
  const { account, chainId, getSigner } = useWallet()
  const [state, setState] = useState<ReadState>({ status: 'idle' })
  const [lookupError, setLookupError] = useState('')
  const [id, setId] = useState('')
  const [refresh, setRefresh] = useState(0)
  const generation = useRef(0)
  const requestKey = `${account ?? ''}:${chainId?.toString() ?? ''}:${version}:${refresh}`

  useEffect(() => {
    const requestGeneration = generation
    const current = ++generation.current
    if (!active || !account) return () => { requestGeneration.current++ }
    getSigner().then(latestLoans).then(loans => {
      if (current === generation.current) setState({ status: 'success', key: requestKey, loans })
    }, reason => {
      if (current === generation.current) {
        setState({ status: 'error', key: requestKey, message: reason instanceof Error ? reason.message : 'Could not load loans.' })
      }
    })
    return () => { requestGeneration.current++ }
  }, [active, account, chainId, getSigner, refresh, requestKey])

  const currentState = active && state.status !== 'idle' && state.key === requestKey ? state : null
  const loans = currentState?.status === 'success' ? currentState.loans : []
  const filtered = loans.filter(loan => scope === 'borrower' ? loan.borrower.toLowerCase() === account?.toLowerCase() :
    scope === 'lender' ? loan.lender.toLowerCase() === account?.toLowerCase() : true)
  const emptyLabel = scope === 'borrower' ? 'No borrower loans in the latest 30 requests.' :
    scope === 'lender' ? 'No loans funded by this wallet in the latest 30 requests.' :
      'No loans found in the latest 30 requests.'
  const loading = active && !!account && currentState === null

  function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^[1-9]\d*$/.test(id)) { setLookupError('Enter a positive loan ID.'); return }
    setLookupError('')
    onSelect(BigInt(id))
  }

  return <section className="card">
    <div className="card-header"><div><span className="eyebrow">ON-CHAIN LOANS</span><h2>{scope === 'all' ? 'Marketplace' : scope === 'borrower' ? 'My Loans' : 'My Portfolio'}</h2></div>
      <button className="secondary" type="button" disabled={!account || loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    </div>
    <p className="hint">Showing at most the latest 30 on-chain requests. Each loan has one lender and requires full-principal funding and full repayment.</p>
    {!account ? <p className="muted">Connect a wallet to read loans.</p> : loading ? <p className="muted" role="status">Loading on-chain loans…</p> :
      currentState?.status === 'error' ? <p className="error" role="alert">{currentState.message}</p> :
      filtered.length === 0 ? <p className="muted">{emptyLabel}</p> :
        <div className="loan-list">{filtered.map(loan => <button className="loan-item" key={loan.id.toString()} onClick={() => onSelect(loan.id)}>
          #{loan.id.toString()} · {eth(loan.principal)} native tokens · {['Requested', 'Active', 'Repaid', 'Defaulted'][Number(loan.state)] || 'Unknown'}
          {loan.state === 0n && <> · Fund full amount</>}
        </button>)}</div>}
    <form onSubmit={lookup}><label htmlFor={`loan-id-${scope}`}>Loan ID lookup</label><div className="lookup">
      <input id={`loan-id-${scope}`} inputMode="numeric" value={id} onChange={event => { setId(event.target.value); setLookupError('') }} />
      <button className="secondary" type="submit" disabled={!account || loading}>View</button>
    </div></form>
    {lookupError && <p className="error" role="alert">{lookupError}</p>}
  </section>
}
