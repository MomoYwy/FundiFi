// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WalletProvider, useWallet } from './WalletContext'

function Probe() {
  const wallet = useWallet()
  return <><p>{wallet.account || 'disconnected'}:{wallet.chainId?.toString() || 'none'}</p><p role="alert">{wallet.error}</p>
    <button onClick={() => void wallet.connect()}>Connect</button><button onClick={wallet.disconnect}>Disconnect</button>
    <button onClick={() => void wallet.getSigner().catch(() => { document.title = 'signer rejected' })}>Sign</button></>
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('tracks wallet events, enforces network, and locally disconnects', async () => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  let chain = '0x7a69'
  const provider = {
    request: vi.fn(async ({ method }: { method: string }) => method === 'eth_chainId' ? chain : [address]),
    on: (event: string, listener: (...args: unknown[]) => void) => listeners.set(event, listener),
    removeListener: (event: string) => listeners.delete(event),
  }
  vi.stubGlobal('ethereum', provider)
  vi.stubEnv('VITE_ESCROW_ADDRESS', address)
  vi.stubEnv('VITE_CHAIN_ID', '31337')
  render(<WalletProvider><Probe /></WalletProvider>)
  fireEvent.click(screen.getByText('Connect'))
  await screen.findByText(/0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa:31337/)
  chain = '0x1'
  listeners.get('chainChanged')?.(chain)
  await screen.findByText(/:1$/)
  fireEvent.click(screen.getByText('Sign'))
  await waitFor(() => expect(document.title).toBe('signer rejected'))
  listeners.get('accountsChanged')?.(['0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'])
  await screen.findByText(/0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB:1/)
  listeners.get('accountsChanged')?.([])
  await screen.findByText('disconnected:none')
  listeners.get('accountsChanged')?.([address])
  expect(screen.getByText('disconnected:none')).toBeTruthy()
})

it('rejects wallet use when no contract is deployed at the configured address', async () => {
  const address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  vi.stubGlobal('ethereum', {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return '0x7a69'
      if (method === 'eth_getCode') return '0x'
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [address]
      throw new Error(`Unexpected method ${method}`)
    }),
    on: vi.fn(), removeListener: vi.fn(),
  })
  vi.stubEnv('VITE_ESCROW_ADDRESS', address)
  vi.stubEnv('VITE_CHAIN_ID', '31337')
  document.title = ''
  render(<WalletProvider><Probe /></WalletProvider>)
  fireEvent.click(screen.getByText('Connect'))
  await screen.findByText(/:31337$/)
  fireEvent.click(screen.getByText('Sign'))
  await waitFor(() => expect(document.title).toBe('signer rejected'))
})

it('reports a rejected wallet connection', async () => {
  vi.stubGlobal('ethereum', {
    request: vi.fn().mockRejectedValue({ code: 4001 }),
    on: vi.fn(), removeListener: vi.fn(),
  })
  render(<WalletProvider><Probe /></WalletProvider>)
  fireEvent.click(screen.getByText('Connect'))
  await screen.findByText('Wallet request rejected.')
})
