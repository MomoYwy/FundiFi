// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { isAmountInTier } from './loan'

const mocks = vi.hoisted(() => ({
  account: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  chainId: 31337n as bigint | null,
  connect: vi.fn(),
  disconnect: vi.fn(),
  getSigner: vi.fn(),
  quote: vi.fn(),
  predict: vi.fn(),
  latest: vi.fn(),
  read: vi.fn(),
  repayAmount: vi.fn(),
  fund: vi.fn(),
  repay: vi.fn(),
  request: vi.fn(),
  wait: vi.fn(),
}))
vi.mock('./web3/WalletContext', () => ({
  useWallet: () => ({ account: mocks.account, chainId: mocks.chainId, error: '', connecting: false, connect: mocks.connect, disconnect: mocks.disconnect, getSigner: mocks.getSigner }),
  walletError: (error: unknown) => error instanceof Error ? error.message : 'Wallet request failed.',
}))
vi.mock('./web3/config', () => ({ getConfig: () => ({ chainId: 31337n, address: mocks.account, explorer: 'https://explorer.example' }) }))
vi.mock('./api/client', () => ({ ApiError: class ApiError extends Error {}, getHealth: vi.fn().mockResolvedValue({ status: 'ok', models_loaded: true }), predictRisk: mocks.predict }))
vi.mock('./web3/escrow', () => ({
  eth: (value: bigint) => (Number(value) / 1e18).toString(),
  PENDING_RISK: (1n << 64n) - 1n,
  quotePrincipal: mocks.quote, latestLoans: mocks.latest, readLoan: mocks.read,
  repaymentAmount: mocks.repayAmount, fundLoan: mocks.fund, repayLoan: mocks.repay, requestLoan: mocks.request,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.account = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  mocks.chainId = 31337n
  mocks.getSigner.mockResolvedValue('signer')
  mocks.quote.mockResolvedValue(100000000000000000n)
  mocks.latest.mockResolvedValue([])
  mocks.wait.mockResolvedValue({ status: 1, hash: '0x123' })
  mocks.request.mockResolvedValue({ hash: '0x123', wait: mocks.wait })
})
afterEach(cleanup)

function fillForm() {
  fireEvent.change(screen.getByLabelText('Requested amount (RM)'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('Annual interest (basis points)'), { target: { value: '1200' } })
  fireEvent.change(screen.getByLabelText('Duration (days)'), { target: { value: '365' } })
  fireEvent.change(screen.getByLabelText('Borrow frequency'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Repayment velocity'), { target: { value: '1' } })
}

it('respects contract tier boundaries including the gap', () => {
  expect([499, 500, 3000, 3000.5, 3001, 15000, 15001].map(amount =>
    [isAmountInTier(amount, 'tier1'), isAmountInTier(amount, 'tier2')])).toEqual([
    [false, false], [true, false], [true, false], [false, false], [false, true], [false, true], [false, false],
  ])
})

it('assesses using the connected account and requests the quoted principal only after explicit confirmation', async () => {
  mocks.predict.mockResolvedValue({ risk_score: 0.48, approved: true, risk_category: 'MEDIUM' })
  render(<App />)
  fillForm()
  fireEvent.click(screen.getByRole('button', { name: /get risk assessment/i }))
  await screen.findByText('0.4800')
  expect(mocks.predict).toHaveBeenCalledWith({ wallet_address: mocks.account, requested_amount: 500, borrow_frequency: 0, repayment_velocity: 1 })
  expect(mocks.request).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: /request loan on-chain/i }))
  await screen.findByText('Transaction confirmed successfully.')
  expect(mocks.request).toHaveBeenCalledWith('signer', 100000000000000000n, 1200, 365, 'tier1')
  expect(screen.getByText('View transaction 0x123').getAttribute('href')).toBe('https://explorer.example/tx/0x123')
})

it('does not request a loan for an ineligible model response or API failure', async () => {
  mocks.predict.mockResolvedValueOnce({ risk_score: 0.9, approved: false, risk_category: 'HIGH' }).mockRejectedValueOnce(new Error('Unavailable'))
  render(<App />)
  fillForm()
  fireEvent.click(screen.getByRole('button', { name: /get risk assessment/i }))
  await screen.findByText('0.9000')
  expect(screen.queryByRole('button', { name: /request loan on-chain/i })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /get risk assessment/i }))
  await screen.findByText('Unavailable')
  expect(mocks.request).not.toHaveBeenCalled()
})

it('invalidates an assessment when the account changes', async () => {
  mocks.predict.mockResolvedValue({ risk_score: 0.1, approved: true, risk_category: 'LOW' })
  const { rerender } = render(<App />)
  fillForm()
  fireEvent.click(screen.getByRole('button', { name: /get risk assessment/i }))
  await screen.findByText('0.1000')
  mocks.account = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  rerender(<App />)
  await waitFor(() => expect(screen.queryByText('0.1000')).toBeNull())
})

it('does not send a request if the quoted principal changes', async () => {
  mocks.predict.mockResolvedValue({ risk_score: 0.1, approved: true, risk_category: 'LOW' })
  mocks.quote.mockResolvedValueOnce(100000000000000000n).mockResolvedValueOnce(200000000000000000n)
  render(<App />)
  fillForm()
  fireEvent.click(screen.getByRole('button', { name: /get risk assessment/i }))
  fireEvent.click(await screen.findByRole('button', { name: /request loan on-chain/i }))
  await screen.findByText(/principal quote changed/i)
  expect(mocks.request).not.toHaveBeenCalled()
})

it('funds the displayed full principal and shows pending and confirmed states', async () => {
  const loan = { id: 1n, borrower: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', lender: '', state: 0n, principal: 100000000000000000n, interestRate: 1200n, duration: 31536000n, startTime: 0n, riskScore: 2n }
  mocks.latest.mockResolvedValue([loan]); mocks.read.mockResolvedValue(loan)
  let resolve!: (value: { status: number; hash: string }) => void
  mocks.fund.mockResolvedValue({ hash: '0x123', wait: () => new Promise(r => { resolve = r }) })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /#1 ·/i }))
  fireEvent.click(await screen.findByRole('button', { name: /Fund full 0.1 native tokens/i }))
  await screen.findByText('Pending block confirmation.')
  expect(mocks.fund).toHaveBeenCalledWith('signer', 1n, loan.principal)
  resolve({ status: 1, hash: '0x123' })
  await screen.findByText('Transaction confirmed successfully.')
})

it('repays the displayed full amount only for the borrower', async () => {
  const loan = { id: 2n, borrower: mocks.account, lender: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', state: 1n, principal: 100000000000000000n, interestRate: 1200n, duration: 31536000n, startTime: 1n, riskScore: 2n }
  mocks.latest.mockResolvedValue([loan]); mocks.read.mockResolvedValue(loan); mocks.repayAmount.mockResolvedValue(112000000000000000n)
  mocks.repay.mockResolvedValue({ hash: '0x123', wait: mocks.wait })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /#2 ·/i }))
  fireEvent.click(await screen.findByRole('button', { name: /Repay full 0.112 native tokens/i }))
  await screen.findByText('Transaction confirmed successfully.')
  expect(mocks.repay).toHaveBeenCalledWith('signer', 2n, 112000000000000000n)
})
