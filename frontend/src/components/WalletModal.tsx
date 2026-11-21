import { useCallback } from 'react'
import { useWallet } from '../web3/WalletContext'
import { Dialog } from './Dialog'

export function WalletModal({ onClose }: { onClose: () => void }) {
  const { account, connect, disconnect, connecting, error } = useWallet()
  const close = useCallback(() => onClose(), [onClose])
  return <Dialog title="Wallet connection" onClose={close}>
    {account ? <><p className="muted">Connected wallet</p><p className="hash dialog-address">{account}</p><button className="secondary action" onClick={disconnect}>Disconnect locally</button><p className="hint">To revoke wallet permissions, use your wallet settings.</p></> :
      <><p className="muted">Connect an injected wallet such as MetaMask to use FundiFi.</p><button className="primary action" disabled={connecting} onClick={() => void connect()}>{connecting ? 'Connecting…' : 'Connect MetaMask'}</button>{error && <p className="error" role="alert">{error}</p>}</>}
    <p className="hint">WalletConnect and identity verification are not available. A wallet connection does not verify identity.</p>
  </Dialog>
}
