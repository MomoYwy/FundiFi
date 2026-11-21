import { useEffect, useRef, useState } from 'react'
import { EVENT_CONFIRMATIONS, MAX_EVENT_BLOCKS, readLifecycleEvents, type LifecycleEvents } from './escrow'
import { useWallet } from './WalletContext'

type ReadState = { status: 'idle' | 'loading' } |
  { status: 'success'; result: LifecycleEvents } |
  { status: 'error'; message: string }

export function LoanEvents({ loanId }: { loanId: bigint }) {
  const { getSigner } = useWallet()
  const [state, setState] = useState<ReadState>({ status: 'idle' })
  const generation = useRef(0)
  useEffect(() => {
    const currentGeneration = generation
    return () => { currentGeneration.current++ }
  }, [])

  async function load() {
    const current = ++generation.current
    setState({ status: 'loading' })
    try {
      const result = await readLifecycleEvents(await getSigner(), { loanId })
      if (current === generation.current) setState({ status: 'success', result })
    } catch (error) {
      if (current === generation.current) setState({ status: 'error', message: error instanceof Error ? error.message : 'Event read failed.' })
    }
  }

  return <section aria-label="Loan lifecycle events">
    <h3>Loan lifecycle events</h3>
    <p className="hint">On demand, up to {MAX_EVENT_BLOCKS} blocks with at least {EVENT_CONFIRMATIONS} confirmations. This is not complete history; reorganizations can still occur.</p>
    <button className="secondary" type="button" disabled={state.status === 'loading'} onClick={() => void load()}>{state.status === 'loading' ? 'Loading events…' : 'Load recent events'}</button>
    {state.status === 'loading' && <p role="status">Loading confirmed events…</p>}
    {state.status === 'error' && <p className="error" role="alert">Could not load events: {state.message}</p>}
    {state.status === 'success' && (state.result.fromBlock === null ?
      <p>No sufficiently confirmed blocks are available yet.</p> :
      <div aria-live="polite">
        <p>Bounded read: blocks {state.result.fromBlock}–{state.result.toBlock} (chain head {state.result.headBlock}).</p>
        {state.result.events.length === 0 ? <p>No lifecycle events found in this range.</p> :
          <ul>{state.result.events.map(event => <li key={`${event.transactionHash}-${event.logIndex}`}>
            {event.name} · block {event.blockNumber} · transaction <span className="hash">{event.transactionHash}</span>
          </li>)}</ul>}
      </div>)}
  </section>
}
