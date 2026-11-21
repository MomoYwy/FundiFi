import { useCallback, useState } from 'react'
import { getConfig } from '../web3/config'
import { readContractStatus, type ContractStatus } from '../web3/escrow'
import { useWallet } from '../web3/WalletContext'
import { Dialog } from './Dialog'

export function ContractInspector({ onClose }: { onClose: () => void }) {
  const { account, chainId, getSigner } = useWallet()
  const [copyMessage, setCopyMessage] = useState('')
  const [status, setStatus] = useState<{ state: 'idle' } | { state: 'loading'; key: string } | { state: 'success'; key: string; data: ContractStatus } | { state: 'error'; key: string; message: string }>({ state: 'idle' })
  const close = useCallback(() => onClose(), [onClose])
  const requestKey = chainId?.toString() ?? ''
  let config: ReturnType<typeof getConfig> | null = null
  let error = ''
  try { config = getConfig() } catch (reason) { error = reason instanceof Error ? reason.message : 'Invalid configuration.' }
  async function copyAddress() {
    if (!config) return
    try { await navigator.clipboard.writeText(config.address); setCopyMessage('Address copied.') }
    catch { setCopyMessage('Could not copy address. Select it manually.') }
  }
  async function loadStatus() {
    setStatus({ state: 'loading', key: requestKey })
    try { setStatus({ state: 'success', key: requestKey, data: await readContractStatus(await getSigner()) }) }
    catch (reason) { setStatus({ state: 'error', key: requestKey, message: reason instanceof Error ? reason.message : 'Could not read contract state.' }) }
  }
  const currentStatus = status.state !== 'idle' && status.key === requestKey ? status : null
  return <Dialog title="Smart contract inspector" onClose={close}>
    {error ? <p className="error" role="alert">{error}</p> : config && <>
      <p className="muted">Configured escrow address</p><p className="hash dialog-address">{config.address}</p>
      <p>Configured chain ID: {config.chainId.toString()}</p>
      <p className="hint">Configuration is not proof of contract identity, verification or audit status. Verify the deployment independently.</p>
      <section aria-label="Live contract state">
        <h3>Live contract state</h3>
        <p className="hint">Read on demand from the connected wallet's configured network.</p>
        <button className="secondary" type="button" disabled={!account || currentStatus?.state === 'loading'} onClick={() => void loadStatus()}>{currentStatus?.state === 'loading' ? 'Reading contract…' : 'Read contract state'}</button>
        {!account && <p className="muted">Connect a wallet to read the contract.</p>}
        {currentStatus?.state === 'error' && <p className="error" role="alert">Could not read contract state: {currentStatus.message}</p>}
        {currentStatus?.state === 'success' && <p role="status">Loan count: {currentStatus.data.loanCount.toString()} · chain head: block {currentStatus.data.blockNumber}</p>}
      </section>
      <div className="dialog-actions"><button className="secondary" onClick={() => void copyAddress()}>Copy address</button>
        {config.explorer ? <a className="secondary" href={`${config.explorer}/address/${config.address}`} target="_blank" rel="noreferrer">Open explorer</a> : <button className="secondary" disabled>Explorer not configured</button>}</div>
      {copyMessage && <p className="hint" role="status">{copyMessage}</p>}
    </>}
    <p className="hint">No audit report is provided. Confirmed event reads are available in Activity & alerts.</p>
  </Dialog>
}
