import { Contract, formatEther, parseUnits, type JsonRpcSigner, type TransactionResponse } from 'ethers'
import abi from './escrow-abi.json'
import { getConfig } from './config'
import type { LoanTier } from '../loan'

export const PENDING_RISK = (1n << 64n) - 1n
const SCALE = 10n ** 18n
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
  if (id < 1n || id > await contract(signer).loanCount()) throw new Error('Loan ID not found.')
  const row = await contract(signer).loans(id)
  return {
    id: row.id, borrower: row.borrower, lender: row.lender, state: row.state,
    principal: row.principal, interestRate: row.interestRate, duration: row.duration,
    startTime: row.startTime, riskScore: row.riskScore,
  }
}

export async function latestLoans(signer: JsonRpcSigner): Promise<Loan[]> {
  const count: bigint = await contract(signer).loanCount()
  const ids = Array.from({ length: Number(count < 30n ? count : 30n) }, (_, index) => count - BigInt(index))
  return Promise.all(ids.map(id => readLoan(signer, id)))
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
