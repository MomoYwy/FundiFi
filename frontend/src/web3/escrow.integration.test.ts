import { readFileSync } from 'node:fs'
import { Contract, ContractFactory, JsonRpcProvider, parseEther } from 'ethers'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { fundLoan, latestLoans, PENDING_RISK, quotePrincipal, readLoan, repayLoan, repaymentAmount, requestLoan } from './escrow'

describe.skipIf(!process.env.FUNDIFI_RPC_TEST)('local escrow integration', () => {
  const provider = new JsonRpcProvider(process.env.FUNDIFI_RPC_TEST)
  afterAll(() => { provider.destroy(); vi.unstubAllEnvs() })

  it('requests, attests, funds and repays exact contract values', async () => {
    const rpcUrl = new URL(process.env.FUNDIFI_RPC_TEST || '')
    if (!['localhost', '127.0.0.1', '[::1]'].includes(rpcUrl.hostname) || (await provider.getNetwork()).chainId !== 31337n) {
      throw new Error('Integration tests require a local Hardhat network (chain 31337).')
    }
    const artifact = JSON.parse(readFileSync(new URL('../../../artifacts/contracts/P2PLendingEscrow.sol/P2PLendingEscrow.json', import.meta.url), 'utf8'))
    const oracle = await provider.getSigner(0)
    const borrower = await provider.getSigner(1)
    const lender = await provider.getSigner(2)
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, oracle)
    const deployed = await factory.deploy(parseEther('10000'))
    await deployed.waitForDeployment()
    const address = await deployed.getAddress()
    vi.stubEnv('VITE_ESCROW_ADDRESS', address)
    vi.stubEnv('VITE_CHAIN_ID', '31337')
    const principal = await quotePrincipal(borrower, '1000', 'tier1')
    expect(principal).toBe(parseEther('0.1'))
    await (await requestLoan(borrower, principal, 1200, 365, 'tier1')).wait()
    const loan = await readLoan(borrower, 1n)
    expect(loan.riskScore).toBe(PENDING_RISK)
    await expect(fundLoan(lender, 1n, principal)).rejects.toThrow('oracle attestation')
    const oracleContract = new Contract(address, artifact.abi, oracle)
    await (await oracleContract.submitRiskAssessment(1n, parseEther('0.2'), `0x${'11'.repeat(32)}`)).wait()
    expect((await latestLoans(lender))[0].id).toBe(1n)
    await expect(fundLoan(lender, 1n, principal + 1n)).rejects.toThrow('principal changed')
    await (await fundLoan(lender, 1n, principal)).wait()
    const due = await repaymentAmount(borrower, 1n)
    expect(due).toBe(parseEther('0.112'))
    await expect(repayLoan(lender, 1n, due)).rejects.toThrow('Only the borrower')
    await expect(repayLoan(borrower, 1n, due - 1n)).rejects.toThrow('amount due changed')
    await (await repayLoan(borrower, 1n, due)).wait()
    expect((await readLoan(borrower, 1n)).state).toBe(2n)
    const uneven = await factory.deploy(parseEther('3000'))
    await uneven.waitForDeployment()
    vi.stubEnv('VITE_ESCROW_ADDRESS', await uneven.getAddress())
    await expect(quotePrincipal(borrower, '1000', 'tier1')).rejects.toThrow('cannot be represented exactly')
  }, 30000)
})
