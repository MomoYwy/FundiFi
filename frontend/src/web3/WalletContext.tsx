import { BrowserProvider, getAddress, type Eip1193Provider } from 'ethers'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getConfig } from './config'

interface InjectedProvider extends Eip1193Provider {
  on(event: string, listener: (...args: unknown[]) => void): void
  removeListener(event: string, listener: (...args: unknown[]) => void): void
}

declare global {
  interface Window { ethereum?: InjectedProvider }
}

interface WalletContextValue {
  account: string | null
  chainId: bigint | null
  error: string
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
  getSigner: () => Promise<import('ethers').JsonRpcSigner>
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null)
  const [chainId, setChainId] = useState<bigint | null>(null)
  const [error, setError] = useState('')
  const [connecting, setConnecting] = useState(false)
  const connected = useRef(false)
  const version = useRef(0)

  const disconnect = useCallback(() => {
    version.current++
    connected.current = false
    setAccount(null)
    setChainId(null)
    setError('')
    setConnecting(false)
  }, [])

  const connect = useCallback(async () => {
    const injected = window.ethereum
    if (!injected) { setError('No wallet provider found. Install or enable MetaMask.'); return }
    const current = ++version.current
    setConnecting(true)
    setError('')
    try {
      const accounts = await injected.request({ method: 'eth_requestAccounts' })
      const chain = await injected.request({ method: 'eth_chainId' })
      if (current !== version.current) return
      if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || typeof chain !== 'string') throw new Error('Wallet returned invalid account or network.')
      setAccount(getAddress(accounts[0]))
      setChainId(BigInt(chain))
      connected.current = true
    } catch (err) {
      if (current === version.current) setError(walletError(err))
    } finally {
      if (current === version.current) setConnecting(false)
    }
  }, [])

  useEffect(() => {
    const injected = window.ethereum
    if (!injected) return
    const accountsChanged = (...args: unknown[]) => {
      if (!connected.current) return
      const accounts = args[0]
      if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') { disconnect(); return }
      try { setAccount(getAddress(accounts[0])); setError('') }
      catch { disconnect(); setError('Wallet returned an invalid account.') }
    }
    const chainChanged = (...args: unknown[]) => {
      if (!connected.current) return
      try {
        if (typeof args[0] !== 'string') throw new Error('Invalid chain')
        setChainId(BigInt(args[0]))
        setError('')
      } catch { disconnect(); setError('Wallet returned an invalid network.') }
    }
    const disconnected = () => { disconnect(); setError('Wallet disconnected.') }
    injected.on('accountsChanged', accountsChanged)
    injected.on('chainChanged', chainChanged)
    injected.on('disconnect', disconnected)
    return () => {
      injected.removeListener('accountsChanged', accountsChanged)
      injected.removeListener('chainChanged', chainChanged)
      injected.removeListener('disconnect', disconnected)
    }
  }, [disconnect])

  const getSigner = useCallback(async () => {
    const injected = window.ethereum
    if (!account || !injected) throw new Error('Connect your wallet first.')
    const { chainId: expected } = getConfig()
    const [accounts, chain] = await Promise.all([
      injected.request({ method: 'eth_accounts' }),
      injected.request({ method: 'eth_chainId' }),
    ])
    if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || getAddress(accounts[0]) !== account) throw new Error('Wallet account changed. Reconnect and try again.')
    if (typeof chain !== 'string' || BigInt(chain) !== expected) throw new Error(`Switch your wallet to chain ${expected}.`)
    const provider = new BrowserProvider(injected)
    const signer = await provider.getSigner(account)
    if (await provider.getCode(getConfig().address) === '0x') throw new Error('No contract is deployed at the configured address on this network.')
    return signer
  }, [account])

  const value = useMemo(() => ({ account, chainId, error, connecting, connect, disconnect, getSigner }), [account, chainId, error, connecting, connect, disconnect, getSigner])
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const value = useContext(WalletContext)
  if (!value) throw new Error('WalletProvider is missing.')
  return value
}

export function walletError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error &&
    (error.code === 4001 || error.code === 'ACTION_REJECTED')) return 'Wallet request rejected.'
  if (error instanceof Error) return error.message
  return 'Wallet request failed.'
}
