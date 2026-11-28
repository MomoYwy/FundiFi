import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test, expect } from '@playwright/test'
import { Contract, JsonRpcProvider } from 'ethers'
import abi from '../src/web3/escrow-abi.json' with { type: 'json' }
import { installLocalWallet, switchAccount, verifyLocalNode } from './local-wallet'

const address = process.env.FUNDIFI_E2E_ADDRESS || ''

test('local loan permissions, pending risk, and lifecycle history', async ({ page }) => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Set FUNDIFI_E2E_ADDRESS to a freshly seeded local escrow.')
  await verifyLocalNode()
  const provider = new JsonRpcProvider('http://127.0.0.1:18545', undefined, { cacheTimeout: -1 })
  try {
    const escrow = new Contract(address, abi, provider)
    if (await escrow.loanCount() !== 9n) throw new Error('Business-rule test requires nine freshly seeded loans.')
    await mkdir(resolve('test-results', 'evidence'), { recursive: true })
    await installLocalWallet(page, address)
    await page.goto('/')
    await page.getByRole('button', { name: 'Connect wallet' }).click()
    const dialog = page.getByRole('dialog', { name: 'Wallet connection' })
    await dialog.getByRole('button', { name: 'Connect MetaMask' }).click()
    await expect(dialog.getByText('Connected wallet')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close Wallet connection' }).click()

    async function openLoan(id: number) {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Marketplace', exact: true }).click()
      await page.getByRole('button', { name: new RegExp(`^#${id} ·`) }).click()
      await expect(page.getByRole('heading', { name: `Loan #${id}`, exact: true })).toBeVisible()
    }

    await switchAccount(page, 4)
    await openLoan(1)
    await expect(page.getByText('Oracle assessment: Pending')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Fund full/ })).toHaveCount(0)
    await expect(escrow.connect(await provider.getSigner(4)).getFunction('fundLoan').staticCall(1n, { value: (await escrow.loans(1)).principal })).rejects.toThrow('RiskAssessmentPending')
    await page.screenshot({ path: resolve('test-results', 'evidence', 'rules-pending-oracle.png'), fullPage: true })

    await switchAccount(page, 1)
    await openLoan(4)
    await expect(page.getByText(/^Oracle assessment: Attested score/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Fund full/ })).toHaveCount(0)
    await expect(escrow.connect(await provider.getSigner(1)).getFunction('fundLoan').staticCall(4n, { value: (await escrow.loans(4)).principal })).rejects.toThrow('BorrowerCannotFundOwnLoan')
    await page.screenshot({ path: resolve('test-results', 'evidence', 'rules-own-loan.png'), fullPage: true })

    await switchAccount(page, 4)
    await openLoan(7)
    await expect(page.getByText('State: Active')).toBeVisible()
    await expect(page.getByText(/^Full amount due:/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Repay full/ })).toHaveCount(0)
    await expect(escrow.connect(await provider.getSigner(4)).getFunction('repayLoan').staticCall(7n, { value: await escrow.repaymentAmount(7n) })).rejects.toThrow('BorrowerOnly')
    await page.screenshot({ path: resolve('test-results', 'evidence', 'rules-non-borrower.png'), fullPage: true })

    await switchAccount(page, 1)
    await expect(page.getByRole('button', { name: /^Repay full/ })).toBeVisible()
    await openLoan(8)
    await expect(page.getByText('State: Repaid')).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Fund full|Repay full)/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Load recent events' }).click()
    const events = page.getByRole('region', { name: 'Loan lifecycle events' })
    for (const name of ['LoanRequested', 'LoanFunded', 'LoanRepaid']) {
      await expect(events.getByText(new RegExp(name))).toBeVisible()
      expect(await escrow.queryFilter(escrow.filters[name](8n), 0, 'latest')).toHaveLength(1)
    }
    await page.screenshot({ path: resolve('test-results', 'evidence', 'rules-repaid-events.png'), fullPage: true })
  } finally {
    provider.destroy()
  }
})
