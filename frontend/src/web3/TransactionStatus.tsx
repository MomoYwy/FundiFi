import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import type { TransactionState } from './useTransaction'

export function TransactionStatus({ state }: { state: TransactionState }) {
  const [dismissed, setDismissed] = useState<TransactionState | null>(null)
  if (state.status === 'idle') return null
  const open = state !== dismissed
  const hash = 'hash' in state ? state.hash : undefined
  const explorer = 'explorer' in state ? state.explorer : undefined
  const text = state.status === 'signature' ? 'Awaiting wallet signature.' : state.status === 'pending' ? 'Pending block confirmation.' :
    state.status === 'success' ? 'Transaction confirmed successfully.' : state.message
  return <>
    {!open && <button className="secondary action" onClick={() => setDismissed(null)}>View transaction status</button>}
    {open && <Dialog title="Transaction status" onClose={() => setDismissed(state)}>
      <div className="notice" role={state.status === 'error' ? 'alert' : 'status'}>{text}
        {hash && <p className="hash">{explorer ? <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction {hash}</a> : <>Transaction hash: {hash}</>}</p>}
      </div>
    </Dialog>}
  </>
}
