import type { TransactionState } from './useTransaction'

export function TransactionStatus({ state }: { state: TransactionState }) {
  if (state.status === 'idle') return null
  const hash = 'hash' in state ? state.hash : undefined
  const explorer = 'explorer' in state ? state.explorer : undefined
  return <div className="notice" role={state.status === 'error' ? 'alert' : 'status'}>
    {state.status === 'signature' && 'Awaiting wallet signature.'}
    {state.status === 'pending' && 'Pending block confirmation.'}
    {state.status === 'success' && 'Transaction confirmed successfully.'}
    {state.status === 'error' && state.message}
    {hash && <p className="hash">{explorer ? <a href={`${explorer}/tx/${hash}`} target="_blank" rel="noreferrer">View transaction {hash}</a> : <>Transaction hash: {hash}</>}</p>}
  </div>
}
