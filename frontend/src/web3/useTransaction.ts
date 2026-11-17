import { useRef, useState } from 'react'
import { isError, type TransactionResponse } from 'ethers'
import { getConfig } from './config'
import { walletError } from './WalletContext'

export type TransactionState =
  | { status: 'idle' }
  | { status: 'signature' }
  | { status: 'pending'; hash: string; explorer: string }
  | { status: 'success'; hash: string; explorer: string }
  | { status: 'error'; message: string; hash?: string; explorer?: string }

export function useTransaction() {
  const [state, setState] = useState<TransactionState>({ status: 'idle' })
  const busy = useRef(false)
  async function run(send: () => Promise<TransactionResponse>) {
    if (busy.current) return false
    busy.current = true
    let hash: string | undefined
    let explorer = ''
    setState({ status: 'signature' })
    try {
      explorer = getConfig().explorer
      const tx = await send()
      hash = tx.hash
      setState({ status: 'pending', hash, explorer })
      const receipt = await tx.wait()
      if (!receipt || receipt.status !== 1) throw new Error('Transaction failed or no receipt was returned.')
      setState({ status: 'success', hash: receipt.hash, explorer })
      return true
    } catch (error) {
      if (isError(error, 'TRANSACTION_REPLACED')) {
        hash = error.replacement.hash
        if (!error.cancelled && error.receipt.status === 1) {
          setState({ status: 'success', hash, explorer: explorer || '' })
          return true
        }
      }
      setState({ status: 'error', message: hash ? `${walletError(error)} Check the transaction before retrying.` : walletError(error), hash, explorer })
      return false
    } finally {
      busy.current = false
    }
  }
  return { state, run }
}
