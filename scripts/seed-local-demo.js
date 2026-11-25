import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ContractFactory, JsonRpcProvider, keccak256, parseEther, toUtf8Bytes } from 'ethers'

const RPC_URL = 'http://127.0.0.1:18545'
const EXPECTED_ACCOUNTS = [
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
]
const RM_PER_ETH = 10000n
const PENDING_RISK = (1n << 64n) - 1n
const LOANS = [
  { borrower: 1, rm: 750n, tier: 0, days: 90, rate: 800, status: 'pending' },
  { borrower: 2, rm: 4500n, tier: 1, days: 180, rate: 1100, status: 'pending' },
  { borrower: 3, rm: 1200n, tier: 0, days: 120, rate: 900, status: 'open', score: '0.12' },
  { borrower: 1, rm: 6500n, tier: 1, days: 270, rate: 1200, status: 'open', score: '0.35' },
  { borrower: 2, rm: 15000n, tier: 1, days: 365, rate: 1500, status: 'open', score: '0.58' },
  { borrower: 3, lender: 4, rm: 2200n, tier: 0, days: 180, rate: 1000, status: 'active', score: '0.18' },
  { borrower: 1, lender: 5, rm: 8000n, tier: 1, days: 365, rate: 1300, status: 'active', score: '0.28' },
  { borrower: 2, lender: 4, rm: 1800n, tier: 0, days: 90, rate: 700, status: 'repaid', score: '0.14' },
  { borrower: 3, lender: 5, rm: 10000n, tier: 1, days: 180, rate: 1000, status: 'repaid', score: '0.22' },
]

export async function assertLocalHardhat(provider) {
  const chainId = await provider.send('eth_chainId', [])
  if (chainId !== '0x7a69') throw new Error('Refusing to seed: expected local chain ID 31337.')
  const client = await provider.send('web3_clientVersion', [])
  if (typeof client !== 'string' || !client.startsWith('HardhatNetwork/')) {
    throw new Error('Refusing to seed: RPC is not a Hardhat node.')
  }
  const metadata = await provider.send('hardhat_metadata', [])
  if (!metadata || metadata.chainId !== 31337 || metadata.forkedNetwork != null) {
    throw new Error('Refusing to seed: expected an unforked local Hardhat network.')
  }
  const accounts = await provider.send('eth_accounts', [])
  if (!Array.isArray(accounts) || EXPECTED_ACCOUNTS.some((address, i) =>
    typeof accounts[i] !== 'string' || accounts[i].toLowerCase() !== address)) {
    throw new Error('Refusing to seed: expected default unlocked Hardhat test accounts 0-5.')
  }
}

async function seed(provider) {
  await assertLocalHardhat(provider)
  const artifact = JSON.parse(await readFile(
    new URL('../artifacts/contracts/P2PLendingEscrow.sol/P2PLendingEscrow.json', import.meta.url), 'utf8',
  ))
  const accounts = await Promise.all(EXPECTED_ACCOUNTS.map((_, index) => provider.getSigner(index)))
  const oracle = accounts[0]
  const escrow = await new ContractFactory(artifact.abi, artifact.bytecode, oracle).deploy(parseEther(RM_PER_ETH.toString()))
  await escrow.waitForDeployment()
  console.log(`Local demo escrow: ${await escrow.getAddress()} (oracle: account #0 ${await oracle.getAddress()})`)
  console.log('Synthetic scores are illustrative only; they are not API assessments or approvals.')

  const summary = []
  for (const loan of LOANS) {
    const principal = parseEther(loan.rm.toString()) / RM_PER_ETH
    const request = await escrow.connect(accounts[loan.borrower]).requestLoan(principal, loan.rate, loan.days * 86400, loan.tier)
    const receipt = await request.wait()
    const event = receipt.logs.map(log => {
      try { return escrow.interface.parseLog(log) } catch { return null }
    }).find(log => log?.name === 'LoanRequested')
    if (!event) throw new Error('LoanRequested event not found in receipt.')
    const id = event.args.loanId

    if (loan.status !== 'pending') {
      const commitment = keccak256(toUtf8Bytes(`local-demo:${id}:${loan.score}`))
      await (await escrow.submitRiskAssessment(id, parseEther(loan.score), commitment)).wait()
    }
    if (loan.lender !== undefined) {
      await (await escrow.connect(accounts[loan.lender]).fundLoan(id, { value: principal })).wait()
      if (loan.status === 'repaid') {
        const due = await escrow.repaymentAmount(id)
        await (await escrow.connect(accounts[loan.borrower]).repayLoan(id, { value: due })).wait()
      }
    }
    const actual = await escrow.loans(id)
    const expectedState = loan.status === 'active' ? 1n : loan.status === 'repaid' ? 2n : 0n
    const expectedRisk = loan.status === 'pending' ? PENDING_RISK : parseEther(loan.score)
    if (actual.id !== id || actual.state !== expectedState || actual.riskScore !== expectedRisk ||
        actual.principal !== principal || actual.borrower.toLowerCase() !== EXPECTED_ACCOUNTS[loan.borrower] ||
        (loan.lender !== undefined && actual.lender.toLowerCase() !== EXPECTED_ACCOUNTS[loan.lender])) {
      throw new Error(`Unexpected on-chain state for loan ${id}.`)
    }
    summary.push({
      ID: id.toString(),
      Borrower: `#${loan.borrower} ${actual.borrower}`,
      Lender: loan.lender === undefined ? '-' : `#${loan.lender} ${actual.lender}`,
      State: { pending: 'Pending oracle', open: 'Attested / open', active: 'Active', repaid: 'Repaid' }[loan.status],
      Tier: loan.tier + 1,
      'Amount (RM)': loan.rm.toString(),
    })
  }
  await provider.send('evm_mine', [])
  console.table(summary)
}

async function main() {
  if (process.argv.length !== 2) throw new Error('This script accepts no arguments and only connects to 127.0.0.1:18545.')
  const provider = new JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 })
  try {
    await seed(provider)
  } finally {
    provider.destroy()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('Local demo seeding failed; any printed deployment may be partially seeded.', error.message)
    process.exitCode = 1
  })
}
