// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { isAmountInTier } from './loan'
import { Dialog } from './components/Dialog'

const mocks = vi.hoisted(() => ({
  account: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as string | null,
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
  events: vi.fn(),
  contractStatus: vi.fn(),
}))
vi.mock('./web3/WalletContext', () => ({
  useWallet: () => ({ account: mocks.account, chainId: mocks.chainId, error: '', connecting: false, connect: mocks.connect, disconnect: mocks.disconnect, getSigner: mocks.getSigner }),
  walletError: (error: unknown) => error instanceof Error ? error.message : 'Wallet request failed.',
}))
vi.mock('./web3/config', () => ({ getConfig: () => ({ chainId: 31337n, address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', explorer: 'https://explorer.example' }) }))
vi.mock('./api/client', () => ({ ApiError: class ApiError extends Error {}, getHealth: vi.fn().mockResolvedValue({ status: 'ok', models_loaded: true }), predictRisk: mocks.predict }))
vi.mock('./web3/escrow', () => ({
  eth: (value: bigint) => (Number(value) / 1e18).toString(),
  PENDING_RISK: (1n << 64n) - 1n,
  MAX_EVENT_BLOCKS: 2000, EVENT_CONFIRMATIONS: 2, readLifecycleEvents: mocks.events,
  readContractStatus: mocks.contractStatus,
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
  mocks.events.mockResolvedValue({ events: [], fromBlock: 0, toBlock: 9, headBlock: 10 })
  mocks.contractStatus.mockResolvedValue({ loanCount: 3n, blockNumber: 10 })
  mocks.wait.mockResolvedValue({ status: 1, hash: '0x123' })
  mocks.request.mockResolvedValue({ hash: '0x123', wait: mocks.wait })
})
afterEach(cleanup)

function fillForm() {
  navigate('Apply for Loan')
  fireEvent.change(screen.getByLabelText('Requested amount (RM)'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('Annual interest (basis points)'), { target: { value: '1200' } })
  fireEvent.change(screen.getByLabelText('Duration (days)'), { target: { value: '365' } })
  fireEvent.change(screen.getByLabelText('Borrow frequency'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Repayment velocity'), { target: { value: '1' } })
}

function navigate(name: string) {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name }))
}

it('sends Escape only to the topmost dialog and keeps focus stable on rerender', () => {
  const closeFirst = vi.fn()
  const closeSecond = vi.fn()
  const { rerender } = render(<><Dialog title="First" onClose={closeFirst}>First content</Dialog><Dialog title="Second" onClose={closeSecond}>Second content</Dialog></>)
  const second = screen.getByRole('dialog', { name: 'Second' })
  expect(document.activeElement).toBe(second)
  rerender(<><Dialog title="First" onClose={() => closeFirst()}>First content</Dialog><Dialog title="Second" onClose={() => closeSecond()}>Second content</Dialog></>)
  expect(document.activeElement).toBe(second)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(closeSecond).toHaveBeenCalledOnce()
  expect(closeFirst).not.toHaveBeenCalled()
})

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
  navigate('Marketplace')
  fireEvent.click(await screen.findByRole('button', { name: /#1 ·/i }))
  expect(await screen.findByRole('heading', { name: 'Loan #1' })).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: /Fund full 0.1 native tokens/i }))
  await screen.findByText('Pending block confirmation.')
  expect(mocks.fund).toHaveBeenCalledWith('signer', 1n, loan.principal)
  fireEvent.click(screen.getByRole('button', { name: 'Close Transaction status' }))
  navigate('Dashboard')
  resolve({ status: 1, hash: '0x123' })
  await screen.findByText('Transaction confirmed successfully.')
  fireEvent.click(screen.getByRole('button', { name: 'Close Transaction status' }))
  expect(screen.getByRole('heading', { name: 'Borrower Dashboard' })).toBeTruthy()
})

it.each([
  { description: 'the oracle assessment is pending', borrower: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', riskScore: (1n << 64n) - 1n },
  { description: 'the connected wallet is the borrower', borrower: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', riskScore: 2n },
])('does not offer funding when $description', async ({ borrower, riskScore }) => {
  const loan = { id: 1n, borrower, lender: '', state: 0n, principal: 100000000000000000n, interestRate: 1200n, duration: 86400n, startTime: 0n, riskScore }
  mocks.latest.mockResolvedValue([loan]); mocks.read.mockResolvedValue(loan)
  render(<App />)
  navigate('Marketplace')
  fireEvent.click(await screen.findByRole('button', { name: /#1 ·/i }))
  await screen.findByRole('heading', { name: 'Loan #1' })
  expect(screen.queryByRole('button', { name: /Fund full/ })).toBeNull()
  expect(mocks.fund).not.toHaveBeenCalled()
})

it('repays the displayed full amount only for the borrower', async () => {
  const loan = { id: 2n, borrower: mocks.account, lender: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', state: 1n, principal: 100000000000000000n, interestRate: 1200n, duration: 31536000n, startTime: 1n, riskScore: 2n }
  mocks.latest.mockResolvedValue([loan]); mocks.read.mockResolvedValue(loan); mocks.repayAmount.mockResolvedValue(112000000000000000n)
  mocks.repay.mockResolvedValue({ hash: '0x123', wait: mocks.wait })
  render(<App />)
  navigate('My Loans')
  fireEvent.click(await screen.findByRole('button', { name: /#2 ·/i }))
  fireEvent.click(await screen.findByRole('button', { name: /Repay full 0.112 native tokens/i }))
  await screen.findByText('Transaction confirmed successfully.')
  expect(mocks.repay).toHaveBeenCalledWith('signer', 2n, 112000000000000000n)
})

it('shows only this wallet’s lender-funded loans and identifies full repayment semantics', async () => {
  const loans = [
    { id: 2n, borrower: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', lender: mocks.account, state: 1n, principal: 100000000000000000n, interestRate: 1200n, duration: 31536000n, startTime: 1n, riskScore: 2n },
    { id: 1n, borrower: mocks.account, lender: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', state: 2n, principal: 200000000000000000n, interestRate: 1000n, duration: 86400n, startTime: 1n, riskScore: 2n },
  ]
  mocks.latest.mockResolvedValue(loans)
  render(<App />)
  navigate('My Portfolio')
  expect(await screen.findByRole('button', { name: /#2 · 0.1 native tokens · Active/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /#1 ·/ })).toBeNull()
  expect(screen.getByText(/pays the lender directly when the borrower makes one full repayment/i)).toBeTruthy()
  expect(screen.queryByText(/claim yield/i)).toBeNull()
})

it('keeps portfolio read failures separate from empty results', async () => {
  mocks.latest.mockRejectedValue(new Error('Portfolio RPC failed'))
  render(<App />)
  navigate('My Portfolio')
  expect(await screen.findByText('Portfolio RPC failed')).toBeTruthy()
  expect(screen.queryByText(/No loans funded by this wallet/)).toBeNull()
})

it('shows a loan lookup error instead of leaving stale details visible', async () => {
  const loan = { id: 1n, borrower: mocks.account, lender: '', state: 0n, principal: 1n, interestRate: 0n, duration: 86400n, startTime: 0n, riskScore: 2n }
  mocks.latest.mockResolvedValue([loan])
  mocks.read.mockRejectedValue(new Error('Loan ID not found.'))
  render(<App />)
  navigate('Marketplace')
  fireEvent.click(await screen.findByRole('button', { name: /#1 ·/i }))
  expect(await screen.findByText('Could not load loan: Loan ID not found.')).toBeTruthy()
})

it('looks up older loans by ID and loads details through the contract reader', async () => {
  const loan = { id: 44n, borrower: mocks.account, lender: '', state: 0n, principal: 1n, interestRate: 0n, duration: 86400n, startTime: 0n, riskScore: 2n }
  mocks.latest.mockResolvedValue([])
  mocks.read.mockResolvedValue(loan)
  render(<App />)
  navigate('Marketplace')
  expect(await screen.findByText('No loans found in the latest 30 requests.')).toBeTruthy()
  fireEvent.change(document.getElementById('loan-id-all')!, { target: { value: '44' } })
  fireEvent.click(screen.getByRole('button', { name: 'View' }))
  expect(await screen.findByRole('heading', { name: 'Loan #44' })).toBeTruthy()
  expect(mocks.read).toHaveBeenCalledWith('signer', 44n)
})

it('shows activity read failures without converting them into empty results', async () => {
  mocks.events.mockRejectedValue(new Error('Event RPC unavailable'))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Activity & alerts' }))
  fireEvent.click(screen.getByRole('button', { name: 'Load confirmed activity' }))
  expect(await screen.findByText('Could not load activity: Event RPC unavailable')).toBeTruthy()
  expect(screen.queryByText(/No matching loan events found/)).toBeNull()
})

it('shows contract state read errors distinctly in the inspector', async () => {
  mocks.contractStatus.mockRejectedValue(new Error('Contract RPC unavailable'))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Contract inspector/i }))
  fireEvent.click(screen.getByRole('button', { name: 'Read contract state' }))
  expect(await screen.findByText('Could not read contract state: Contract RPC unavailable')).toBeTruthy()
  expect(screen.queryByText(/Loan count:/)).toBeNull()
})

it('navigates to unavailable views without showing simulated outcomes', () => {
  render(<App />)
  navigate('AI Insights')
  expect(screen.getByRole('heading', { name: 'AI Insights' })).toBeTruthy()
  expect(within(screen.getByRole('region', { name: 'Model metrics' })).getAllByText('Unavailable')).toHaveLength(4)
  expect(screen.getByText(/no fraud event feed is connected/i)).toBeTruthy()
  expect(screen.queryByText('93.4%')).toBeNull()
  navigate('Compliance')
  expect(screen.getByRole('button', { name: /Approve override/ }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByRole('button', { name: /Block & blacklist/ }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByText(/does not grant administrator permissions/i)).toBeTruthy()
  navigate('Help & Disputes')
  expect(screen.getByRole('button', { name: /Submit support ticket/ }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByLabelText('Description').matches(':disabled')).toBe(true)
  expect(screen.getByLabelText('Attachment').matches(':disabled')).toBe(true)
  expect(screen.getByText(/no ticket history service is connected/i)).toBeTruthy()
  navigate('Dashboard')
  expect(screen.getByRole('heading', { name: 'Borrower Dashboard' })).toBeTruthy()
})

it('explains unavailable auto-invest without enabling or saving rules', () => {
  render(<App />)
  navigate('My Portfolio')
  fireEvent.click(screen.getByRole('button', { name: 'About auto-invest (unavailable)' }))
  const dialog = screen.getByRole('dialog', { name: 'Auto-invest portfolio rules' })
  expect(within(dialog).getByText(/no rules can be saved/i)).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: /Save auto-invest rules/ }).hasAttribute('disabled')).toBe(true)
  expect(within(dialog).getByLabelText('Maximum investment per loan').matches(':disabled')).toBe(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('opens and closes activity, wallet and contract dialogs', async () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Activity & alerts' }))
  expect(screen.getByRole('dialog', { name: 'Activity & alerts' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Loans' }))
  expect(screen.getByRole('button', { name: 'Loans' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: /Yields — unavailable/ }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Load confirmed activity' }))
  expect(await screen.findByText(/No matching loan events found/)).toBeTruthy()
  expect(screen.getByText(/Bounded read: blocks 0–9/)).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /0xaaaa…aaaa/i }))
  expect(screen.getByRole('dialog', { name: 'Wallet connection' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close Wallet connection' }))
  fireEvent.click(screen.getByRole('button', { name: /Contract inspector/i }))
  expect(screen.getByRole('dialog', { name: 'Smart contract inspector' })).toBeTruthy()
  expect(screen.getByText(/not proof of contract identity/i)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Read contract state' }))
  expect(await screen.findByText('Loan count: 3 · chain head: block 10')).toBeTruthy()
  expect(mocks.contractStatus).toHaveBeenCalledWith('signer')
  fireEvent.click(screen.getByRole('button', { name: 'Close Smart contract inspector' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('does not present a read failure as an empty loan list', async () => {
  mocks.latest.mockRejectedValue(new Error('RPC unavailable'))
  render(<App />)
  navigate('Marketplace')
  expect(await screen.findByText('RPC unavailable')).toBeTruthy()
  expect(screen.queryByText(/No matching loans/)).toBeNull()
})

it('shows bounded event loading, empty and RPC error states without confusing them', async () => {
  const loan = { id: 1n, borrower: mocks.account, lender: '', state: 0n, principal: 1n, interestRate: 0n, duration: 86400n, startTime: 0n, riskScore: 2n }
  mocks.latest.mockResolvedValue([loan]); mocks.read.mockResolvedValue(loan)
  let resolve!: (value: { events: []; fromBlock: number; toBlock: number; headBlock: number }) => void
  mocks.events.mockReturnValueOnce(new Promise(r => { resolve = r }))
    .mockRejectedValueOnce(new Error('RPC unavailable'))
    .mockResolvedValueOnce({ events: [{ name: 'LoanRequested', loanId: 1n, blockNumber: 8, transactionHash: '0x123', logIndex: 0 }], fromBlock: 0, toBlock: 9, headBlock: 10 })
  render(<App />)
  navigate('Marketplace')
  fireEvent.click(await screen.findByRole('button', { name: /#1 ·/i }))
  fireEvent.click(await screen.findByRole('button', { name: 'Load recent events' }))
  expect(await screen.findByText('Loading confirmed events…')).toBeTruthy()
  resolve({ events: [], fromBlock: 0, toBlock: 9, headBlock: 10 })
  expect(await screen.findByText('No lifecycle events found in this range.')).toBeTruthy()
  expect(screen.getByText(/Bounded read: blocks 0–9/)).toBeTruthy()
  expect(mocks.events).toHaveBeenCalledWith('signer', { loanId: 1n })
  fireEvent.click(screen.getByRole('button', { name: 'Load recent events' }))
  expect(await screen.findByText('Could not load events: RPC unavailable')).toBeTruthy()
  expect(screen.queryByText('No lifecycle events found in this range.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Load recent events' }))
  expect(await screen.findByText(/LoanRequested · block 8/)).toBeTruthy()
  expect(screen.getByText('0x123')).toBeTruthy()
})

it('does not switch views when a loan lookup completes after navigation', async () => {
  const loan = { id: 1n, borrower: mocks.account, lender: '', state: 0n, principal: 1n, interestRate: 0n, duration: 86400n, startTime: 0n, riskScore: 2n }
  mocks.latest.mockResolvedValue([loan])
  let resolve!: (value: typeof loan) => void
  mocks.read.mockReturnValue(new Promise(r => { resolve = r }))
  render(<App />)
  navigate('Marketplace')
  fireEvent.click(await screen.findByRole('button', { name: /#1 ·/i }))
  navigate('AI Insights')
  resolve(loan)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'AI Insights' })).toBeTruthy())
  expect(screen.queryByRole('heading', { name: 'Loan #1' })).toBeNull()
})
