import type { Page } from '@playwright/test'

const RPC = 'http://127.0.0.1:18545'
const addresses = [
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
]
const methods = new Set([
  'eth_chainId', 'eth_accounts', 'eth_blockNumber', 'eth_getCode', 'eth_call',
  'eth_estimateGas', 'eth_sendTransaction', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getLogs',
  'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'net_version',
])

export async function localRpc(method: string, params: unknown[] = []) {
  const response = await fetch(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error(`Local RPC HTTP ${response.status}`)
  const body = await response.json() as { result?: unknown; error?: { message: string; code: number } }
  if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code })
  return body.result
}

export async function verifyLocalNode() {
  const [chain, client, metadata, accounts] = await Promise.all([
    localRpc('eth_chainId'), localRpc('web3_clientVersion'),
    localRpc('hardhat_metadata'), localRpc('eth_accounts'),
  ])
  const meta = metadata as { chainId?: number; forkedNetwork?: unknown }
  if (chain !== '0x7a69' || typeof client !== 'string' || !client.startsWith('HardhatNetwork/') ||
      meta.chainId !== 31337 || meta.forkedNetwork != null || !Array.isArray(accounts) ||
      addresses.some((address, i) => typeof accounts[i] !== 'string' || accounts[i].toLowerCase() !== address)) {
    throw new Error('E2E requires the unforked local Hardhat node with default test accounts.')
  }
}

export async function installLocalWallet(page: Page, escrowAddress: string) {
  await verifyLocalNode()
  let active = 1
  let chain = '0x7a69'
  await page.exposeBinding('__setDemoWalletState', (_source, next: { account?: number; chain?: string }) => {
    if (next.account !== undefined) {
      if (!Number.isInteger(next.account) || next.account < 0 || next.account >= addresses.length) throw new Error('Invalid local test account.')
      active = next.account
    }
    if (next.chain !== undefined) {
      if (next.chain !== '0x7a69' && next.chain !== '0x1') throw new Error('Unsupported simulated network.')
      chain = next.chain
    }
  })
  await page.exposeBinding('__localHardhatRpc', async (_source, method: string, params: unknown[]) => {
    if (!methods.has(method)) throw new Error(`Local wallet does not support ${method}`)
    if (chain !== '0x7a69') throw new Error('Local wallet is on the wrong network.')
    if (method === 'eth_sendTransaction') {
      await verifyLocalNode()
      const tx = params[0] as { from?: string; to?: string }
      if (tx?.from?.toLowerCase() !== addresses[active] || tx?.to?.toLowerCase() !== escrowAddress.toLowerCase()) {
        throw new Error('Only the active local test account may send to the seeded escrow.')
      }
    }
    return localRpc(method, params)
  })
  await page.addInitScript((accounts: string[]) => {
    let active = 1
    let chain = '0x7a69'
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const emit = (event: string, value: unknown) => listeners.get(event)?.forEach(listener => listener(value))
    const bridge = window as unknown as {
      ethereum: unknown
      __localHardhatRpc: (method: string, params: unknown[]) => Promise<unknown>
      __setDemoWalletState: (state: { account?: number; chain?: string }) => Promise<void>
      __demoWallet: { setAccount: (index: number) => Promise<void>; setChain: (value: string) => Promise<void> }
    }
    bridge.ethereum = {
      isMetaMask: false,
      on(event: string, listener: (...args: unknown[]) => void) {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(listener)
      },
      removeListener(event: string, listener: (...args: unknown[]) => void) {
        listeners.get(event)?.delete(listener)
      },
      async request({ method, params = [] }: { method: string; params?: unknown[] }) {
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [accounts[active]]
        if (method === 'eth_chainId') return chain
        if (chain !== '0x7a69') throw Object.assign(new Error('Local wallet is on the wrong network.'), { code: 4901 })
        if (method === 'eth_sendTransaction') {
          const transaction = params[0] as { from?: string }
          if (transaction?.from?.toLowerCase() !== accounts[active]) throw new Error('Transaction does not match the active test account.')
        }
        return bridge.__localHardhatRpc(method, params)
      },
    }
    bridge.__demoWallet = {
      async setAccount(index: number) {
        if (!Number.isInteger(index) || index < 0 || index >= accounts.length) throw new Error('Invalid local test account.')
        await bridge.__setDemoWalletState({ account: index })
        active = index
        emit('accountsChanged', [accounts[active]])
      },
      async setChain(value: string) {
        if (value !== '0x7a69' && value !== '0x1') throw new Error('Unsupported simulated network.')
        await bridge.__setDemoWalletState({ chain: value })
        chain = value
        emit('chainChanged', chain)
      },
    }
  }, addresses)
}

export async function switchAccount(page: Page, index: number) {
  await page.evaluate(index => (window as unknown as { __demoWallet: { setAccount: (i: number) => Promise<void> } }).__demoWallet.setAccount(index), index)
}

export async function switchChain(page: Page, chain: string) {
  await page.evaluate(chain => (window as unknown as { __demoWallet: { setChain: (value: string) => Promise<void> } }).__demoWallet.setChain(chain), chain)
}
