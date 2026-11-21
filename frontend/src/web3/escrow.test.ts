import { Interface, type JsonRpcSigner } from 'ethers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import abi from './escrow-abi.json'
import { latestLoans, MAX_EVENT_BLOCKS, readContractStatus, readLifecycleEvents, readLoan } from './escrow'

const mocks = vi.hoisted(() => ({
  loanCount: vi.fn(),
  loans: vi.fn(),
  getBlockNumber: vi.fn(),
  queryFilter: vi.fn(),
  filters: {
    LoanRequested: vi.fn((id: bigint | null) => ({ name: 'LoanRequested', id })),
    LoanFunded: vi.fn((id: bigint | null) => ({ name: 'LoanFunded', id })),
    LoanRepaid: vi.fn((id: bigint | null) => ({ name: 'LoanRepaid', id })),
    LoanDefaulted: vi.fn((id: bigint | null) => ({ name: 'LoanDefaulted', id })),
  },
}))

vi.mock('./config', () => ({ getConfig: () => ({ address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }) }))
vi.mock('ethers', async importOriginal => {
  const actual = await importOriginal<typeof import('ethers')>()
  return { ...actual, Contract: class {
    loanCount = mocks.loanCount
    loans = mocks.loans
    queryFilter = mocks.queryFilter
    filters = mocks.filters
    interface = new actual.Interface(abi)
  } }
})

const signer = Object.assign(Object.create(null), { provider: { getBlockNumber: mocks.getBlockNumber } }) as JsonRpcSigner
const iface = new Interface(abi)
const borrower = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const hash = `0x${'12'.repeat(32)}`

function log(name: string, values: readonly unknown[], blockNumber: number, index: number) {
  const fragment = iface.getEvent(name)
  if (!fragment) throw new Error('Missing event')
  const encoded = iface.encodeEventLog(fragment, values)
  return { ...encoded, blockNumber, index, transactionHash: hash }
}

beforeEach(() => {
  vi.resetAllMocks()
  for (const [name, filter] of Object.entries(mocks.filters)) filter.mockImplementation(id => ({ name, id }))
  mocks.loanCount.mockResolvedValue(0n)
  mocks.loans.mockImplementation(async (id: bigint) => ({
    id, borrower, lender: borrower, state: 0n, principal: 1n, interestRate: 0n,
    duration: 86400n, startTime: 0n, riskScore: 0n,
  }))
  mocks.getBlockNumber.mockResolvedValue(5000)
  mocks.queryFilter.mockResolvedValue([])
})

describe('bounded loan reads', () => {
  it('returns at most 30 newest loans and looks up a valid ID', async () => {
    mocks.loanCount.mockResolvedValue(34n)
    const loans = await latestLoans(signer)
    expect(loans.map(loan => loan.id)).toEqual(Array.from({ length: 30 }, (_, i) => 34n - BigInt(i)))
    expect(mocks.loanCount).toHaveBeenCalledTimes(1)
    expect((await readLoan(signer, 2n)).id).toBe(2n)
    await expect(readLoan(signer, 35n)).rejects.toThrow('Loan ID not found')
  })

  it('returns an empty list only for zero loans and propagates read errors', async () => {
    expect(await latestLoans(signer)).toEqual([])
    mocks.loanCount.mockRejectedValueOnce(new Error('RPC unavailable'))
    await expect(latestLoans(signer)).rejects.toThrow('RPC unavailable')
    mocks.loanCount.mockResolvedValue(1n)
    mocks.loans.mockRejectedValueOnce(new Error('loan read failed'))
    await expect(latestLoans(signer)).rejects.toThrow('loan read failed')
    mocks.loans.mockRejectedValueOnce(new Error('loan lookup failed'))
    await expect(readLoan(signer, 1n)).rejects.toThrow('loan lookup failed')
  })

  it('reads contract status and propagates either RPC read failure', async () => {
    mocks.loanCount.mockResolvedValue(4n)
    mocks.getBlockNumber.mockResolvedValue(123)
    expect(await readContractStatus(signer)).toEqual({ loanCount: 4n, blockNumber: 123 })
    mocks.loanCount.mockRejectedValueOnce(new Error('count unavailable'))
    await expect(readContractStatus(signer)).rejects.toThrow('count unavailable')
    mocks.getBlockNumber.mockRejectedValueOnce(new Error('block unavailable'))
    await expect(readContractStatus(signer)).rejects.toThrow('block unavailable')
  })
})

describe('bounded lifecycle reads', () => {
  it('queries the four exact event filters for one loan and sorts decoded logs', async () => {
    const logs = {
      LoanRequested: [log('LoanRequested', [7n, borrower, 100n, 0], 3001, 0)],
      LoanFunded: [log('LoanFunded', [7n, borrower, 100n], 4000, 0)],
      LoanRepaid: [log('LoanRepaid', [7n, borrower, 110n], 4999, 2)],
      LoanDefaulted: [log('LoanDefaulted', [7n], 4999, 1)],
    }
    mocks.queryFilter.mockImplementation(async (filter: { name: keyof typeof logs }) => logs[filter.name])
    const result = await readLifecycleEvents(signer, { loanId: 7n })
    expect(result).toMatchObject({ fromBlock: 3000, toBlock: 4999, headBlock: 5000 })
    expect(result.events.map(event => [event.name, event.loanId])).toEqual([
      ['LoanRepaid', 7n], ['LoanDefaulted', 7n], ['LoanFunded', 7n], ['LoanRequested', 7n],
    ])
    for (const name of Object.keys(logs)) {
      expect(mocks.queryFilter).toHaveBeenCalledWith({ name, id: 7n }, 3000, 4999)
    }
  })

  it('returns empty results and reports short or explicitly older ranges', async () => {
    mocks.getBlockNumber.mockResolvedValue(10)
    expect(await readLifecycleEvents(signer)).toEqual({ events: [], fromBlock: 0, toBlock: 9, headBlock: 10 })
    expect(await readLifecycleEvents(signer, { blockCount: 3, toBlock: 5 })).toEqual({ events: [], fromBlock: 3, toBlock: 5, headBlock: 10 })
    expect(mocks.queryFilter).toHaveBeenCalledWith({ name: 'LoanRequested', id: null }, 3, 5)
    mocks.getBlockNumber.mockResolvedValue(0)
    expect(await readLifecycleEvents(signer)).toEqual({ events: [], fromBlock: null, toBlock: null, headBlock: 0 })
  })

  it('rejects invalid bounds and unconfirmed ending blocks', async () => {
    await expect(readLifecycleEvents(signer, { blockCount: MAX_EVENT_BLOCKS + 1 })).rejects.toThrow('Block count')
    await expect(readLifecycleEvents(signer, { blockCount: 0 })).rejects.toThrow('Block count')
    await expect(readLifecycleEvents(signer, { loanId: 0n })).rejects.toThrow('Loan ID')
    await expect(readLifecycleEvents(signer, { toBlock: 5000 })).rejects.toThrow('not sufficiently confirmed')
    await expect(readLifecycleEvents(signer, { toBlock: -1 })).rejects.toThrow('Invalid ending block')
  })

  it('propagates head, filter, and decoding failures instead of returning partial results', async () => {
    mocks.getBlockNumber.mockRejectedValueOnce(new Error('head unavailable'))
    await expect(readLifecycleEvents(signer)).rejects.toThrow('head unavailable')
    mocks.queryFilter.mockRejectedValueOnce(new Error('logs unavailable'))
    await expect(readLifecycleEvents(signer)).rejects.toThrow('logs unavailable')
    mocks.queryFilter.mockResolvedValueOnce([log('LoanFunded', [1n, borrower, 100n], 4000, 0)])
    await expect(readLifecycleEvents(signer)).rejects.toThrow('Could not decode LoanRequested')
  })
})
