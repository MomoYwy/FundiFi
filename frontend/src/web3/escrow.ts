import { Contract, formatEther, parseUnits, type JsonRpcSigner, type TransactionResponse } from 'ethers'
import abi from './escrow-abi.json'
import { getConfig } from './config'
import type { LoanTier } from '../loan'

export const PENDING_RISK = (1n << 64n) - 1n
const SCALE = 10n ** 18n
export const MAX_EVENT_BLOCKS = 2000
export const EVENT_CONFIRMATIONS = 2
const lifecycleNames = ['LoanRequested', 'LoanFunded', 'LoanRepaid', 'LoanDefaulted'] as const
export type LifecycleEventName = typeof lifecycleNames[number]
export interface LifecycleEvent {
  name: LifecycleEventName
  loanId: bigint
  blockNumber: number
  transactionHash: string
  logIndex: number
}
export interface LifecycleEvents {
  events: LifecycleEvent[]
  fromBlock: number | null
  toBlock: number | null
  headBlock: number
}
export interface ContractStatus {
  loanCount: bigint
  blockNumber: number
}
export interface Loan {
  id: bigint
  borrower: string
  lender: string
  state: bigint
  principal: bigint
  interestRate: bigint
  duration: bigint
  startTime: bigint
  riskScore: bigint
}

function contract(signer: JsonRpcSigner) {
  return new Contract(getConfig().address, abi, signer)
}

export async function quotePrincipal(signer: JsonRpcSigner, amount: string, tier: LoanTier): Promise<bigint> {
  const rm = parseUnits(amount, 18)
  const rate: bigint = await contract(signer).rmPerEth()
  if (rate <= 0n) throw new Error('Invalid contract exchange rate.')
  const principal = (rm * SCALE + rate - 1n) / rate
  const actualRm = principal * rate / SCALE
  const min = BigInt(tier === 'tier1' ? 500 : 3001) * SCALE
  const max = BigInt(tier === 'tier1' ? 3000 : 15000) * SCALE
  if (actualRm < min || actualRm > max || principal > (1n << 96n) - 1n) throw new Error('Amount cannot be represented within the selected contract tier.')
  if (actualRm !== rm) throw new Error('This RM amount cannot be represented exactly at the contract exchange rate. Choose another amount.')
  return principal
}

export async function requestLoan(signer: JsonRpcSigner, principal: bigint, rateBps: number, days: number, tier: LoanTier): Promise<TransactionResponse> {
  return contract(signer).requestLoan(principal, rateBps, days * 86400, tier === 'tier1' ? 0 : 1)
}

export async function readLoan(signer: JsonRpcSigner, id: bigint): Promise<Loan> {
  const escrow = contract(signer)
  if (id < 1n || id > await escrow.loanCount()) throw new Error('Loan ID not found.')
  return readLoanRow(escrow, id)
}

async function readLoanRow(escrow: Contract, id: bigint): Promise<Loan> {
  const row = await escrow.loans(id)
  return {
    id: row.id, borrower: row.borrower, lender: row.lender, state: row.state,
    principal: row.principal, interestRate: row.interestRate, duration: row.duration,
    startTime: row.startTime, riskScore: row.riskScore,
  }
}

export async function latestLoans(signer: JsonRpcSigner): Promise<Loan[]> {
  const escrow = contract(signer)
  const count: bigint = await escrow.loanCount()
  const ids = Array.from({ length: Number(count < 30n ? count : 30n) }, (_, index) => count - BigInt(index))
  return Promise.all(ids.map(id => readLoanRow(escrow, id)))
}

export async function readContractStatus(signer: JsonRpcSigner): Promise<ContractStatus> {
  const escrow = contract(signer)
  const [loanCount, blockNumber] = await Promise.all([escrow.loanCount(), signer.provider.getBlockNumber()])
  return { loanCount, blockNumber }
}

export async function readLifecycleEvents(
  signer: JsonRpcSigner,
  options: { loanId?: bigint; blockCount?: number; toBlock?: number } = {},
): Promise<LifecycleEvents> {
  const { loanId, blockCount = MAX_EVENT_BLOCKS, toBlock } = options
  if (loanId !== undefined && loanId < 1n) throw new Error('Loan ID must be positive.')
  if (!Number.isSafeInteger(blockCount) || blockCount < 1 || blockCount > MAX_EVENT_BLOCKS) throw new Error(`Block count must be between 1 and ${MAX_EVENT_BLOCKS}.`)
  if (toBlock !== undefined && (!Number.isSafeInteger(toBlock) || toBlock < 0)) throw new Error('Invalid ending block.')
  const headBlock = await signer.provider.getBlockNumber()
  const confirmedHead = headBlock - (EVENT_CONFIRMATIONS - 1)
  if (confirmedHead < 0) {
    if (toBlock !== undefined) throw new Error('No confirmed block is available yet.')
    return { events: [], fromBlock: null, toBlock: null, headBlock }
  }
  const end = toBlock ?? confirmedHead
  if (end > confirmedHead) throw new Error('Ending block is not sufficiently confirmed.')
  const fromBlock = Math.max(0, end - blockCount + 1)
  const escrow = contract(signer)
  const groups = await Promise.all(lifecycleNames.map(async name => {
    const logs = await escrow.queryFilter(escrow.filters[name](loanId ?? null), fromBlock, end)
    return logs.map(log => {
      const parsed = escrow.interface.parseLog(log)
      if (!parsed || parsed.name !== name) throw new Error(`Could not decode ${name} event.`)
      return { name, loanId: parsed.args.loanId as bigint, blockNumber: log.blockNumber, transactionHash: log.transactionHash, logIndex: log.index }
    })
  }))
  const events = groups.flat().sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
  return { events, fromBlock, toBlock: end, headBlock }
}

export async function fundLoan(signer: JsonRpcSigner, id: bigint, expectedPrincipal: bigint): Promise<TransactionResponse> {
  const loan = await readLoan(signer, id)
  if (loan.state !== 0n || loan.riskScore === PENDING_RISK) throw new Error('This loan is not available for funding or is awaiting oracle attestation.')
  if (loan.borrower.toLowerCase() === (await signer.getAddress()).toLowerCase()) throw new Error('Borrowers cannot fund their own loans.')
  if (loan.principal !== expectedPrincipal) throw new Error('The principal changed. Refresh the loan before funding.')
  return contract(signer).fundLoan(id, { value: loan.principal })
}

export async function repaymentAmount(signer: JsonRpcSigner, id: bigint): Promise<bigint> {
  return contract(signer).repaymentAmount(id)
}

export async function repayLoan(signer: JsonRpcSigner, id: bigint, expectedDue: bigint): Promise<TransactionResponse> {
  const loan = await readLoan(signer, id)
  if (loan.state !== 1n || loan.borrower.toLowerCase() !== (await signer.getAddress()).toLowerCase()) throw new Error('Only the borrower can repay an active loan.')
  const due = await repaymentAmount(signer, id)
  if (due !== expectedDue) throw new Error('The amount due changed. Refresh the loan before repayment.')
  return contract(signer).repayLoan(id, { value: due })
}

export function eth(value: bigint): string { return formatEther(value) }
