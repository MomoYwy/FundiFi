import { useEffect, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { EVENT_CONFIRMATIONS, MAX_EVENT_BLOCKS, readLifecycleEvents, type LifecycleEvents } from '../web3/escrow'
import { useWallet } from '../web3/WalletContext'

type ReadState = { status: 'idle' } |
  { status: 'loading'; key: string } |
  { status: 'success'; key: string; result: LifecycleEvents } |
  { status: 'error'; key: string; message: string }

export function ActivityDrawer({ onClose }: { onClose: () => void }) {
  const { account, chainId, getSigner } = useWallet()
  const [filter, setFilter] = useState<'all' | 'loans'>('all')
  const [state, setState] = useState<ReadState>({ status: 'idle' })
  const generation = useRef(0)
  const requestKey = chainId?.toString() ?? ''
  useEffect(() => {
    const currentGeneration = generation
    currentGeneration.current++
    return () => { currentGeneration.current++ }
  }, [])
  useEffect(() => { generation.current++ }, [requestKey])

  async function load() {
    const current = ++generation.current
    setState({ status: 'loading', key: requestKey })
    try {
      const result = await readLifecycleEvents(await getSigner())
      if (current === generation.current) setState({ status: 'success', key: requestKey, result })
    } catch (error) {
      if (current === generation.current) setState({ status: 'error', key: requestKey, message: error instanceof Error ? error.message : 'Event read failed.' })
    }
  }

  const currentState = state.status !== 'idle' && state.key === requestKey ? state : null
  const events = currentState?.status === 'success'
    ? currentState.result.events.filter(event => filter === 'all' || event.name.startsWith('Loan'))
    : []
  return <Dialog title="Activity & alerts" onClose={onClose} drawer>
    <div className="tab-row" aria-label="Activity filters">
      <button type="button" className={`tab${filter === 'all' ? ' selected' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
      <button type="button" className={`tab${filter === 'loans' ? ' selected' : ''}`} aria-pressed={filter === 'loans'} onClick={() => setFilter('loans')}>Loans</button>
      <button type="button" className="tab" disabled title="Yield events are not supported by this contract">Yields — unavailable</button>
      <button type="button" className="tab" disabled title="Security alerts are not connected">Security — unavailable</button>
    </div>
    <p className="hint">Reads contract-wide confirmed escrow events on demand, over at most {MAX_EVENT_BLOCKS} blocks with {EVENT_CONFIRMATIONS} confirmations. This is not a complete history or alert service; it does not poll automatically.</p>
    {!account ? <p className="muted">Connect a wallet to read escrow activity.</p> :
      <button className="secondary" type="button" disabled={currentState?.status === 'loading'} onClick={() => void load()}>{currentState?.status === 'loading' ? 'Loading activity…' : 'Load confirmed activity'}</button>}
    {currentState?.status === 'loading' && <p role="status">Loading confirmed events…</p>}
    {currentState?.status === 'error' && <p className="error" role="alert">Could not load activity: {currentState.message}</p>}
    {currentState?.status === 'success' && (currentState.result.fromBlock === null ?
      <p>No sufficiently confirmed blocks are available yet.</p> :
      <div aria-live="polite">
        <p>Bounded read: blocks {currentState.result.fromBlock}–{currentState.result.toBlock} (chain head {currentState.result.headBlock}).</p>
        {events.length === 0 ? <p>No matching loan events found in this range.</p> :
          <ul>{events.map(event => <li key={`${event.transactionHash}-${event.logIndex}`}>
            {event.name} · loan #{event.loanId.toString()} · block {event.blockNumber} · <span className="hash">{event.transactionHash}</span>
          </li>)}</ul>}
      </div>)}
  </Dialog>
}
