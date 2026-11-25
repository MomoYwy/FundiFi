import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { Contract, JsonRpcProvider, keccak256, parseEther, toUtf8Bytes } from 'ethers'
import abi from '../src/web3/escrow-abi.json' with { type: 'json' }
import { installLocalWallet, switchAccount, switchChain, verifyLocalNode } from './local-wallet'

const address = process.env.FUNDIFI_E2E_ADDRESS || ''
const evidence = resolve('test-results', 'evidence')
let page: Page
let loanId = 0n
let score = ''
const browserErrors: string[] = []

async function screenshot(name: string) {
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, `${name}.png`), fullPage: true })
}

async function navigate(name: string) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name, exact: true }).click()
}

async function openLoan(id: bigint) {
  await navigate('Marketplace')
  await page.getByRole('button', { name: new RegExp(`^#${id} ·`) }).click()
  await expect(page.getByRole('heading', { name: `Loan #${id}`, exact: true })).toBeVisible()
}

async function confirmTransaction() {
  const dialog = page.getByRole('dialog', { name: 'Transaction status' })
  await expect(dialog.getByText('Transaction confirmed successfully.')).toBeVisible({ timeout: 30000 })
  await dialog.getByRole('button', { name: 'Close Transaction status' }).click()
}

test.describe.serial('Local browser lending journey', () => {
  test.beforeAll(async ({ browser }) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('Set FUNDIFI_E2E_ADDRESS to the freshly seeded local escrow.')
    await verifyLocalNode()
    const provider = new JsonRpcProvider('http://127.0.0.1:18545', undefined, { cacheTimeout: -1 })
    try {
      const contract = new Contract(address, abi, provider)
      if (await contract.loanCount() !== 9n) throw new Error('E2E requires a fresh escrow with exactly nine seeded loans.')
    } finally { provider.destroy() }
    page = await browser.newPage({ baseURL: 'http://localhost:5173', viewport: { width: 1440, height: 900 } })
    page.on('pageerror', error => browserErrors.push(`page: ${error.message}`))
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`) })
    await installLocalWallet(page, address)
    await page.goto('/')
    await page.getByRole('button', { name: 'Connect wallet' }).click()
    const dialog = page.getByRole('dialog', { name: 'Wallet connection' })
    await dialog.getByRole('button', { name: 'Connect MetaMask' }).click()
    await expect(dialog.getByText('Connected wallet')).toBeVisible()
    await dialog.getByRole('button', { name: 'Close Wallet connection' }).click()
  })

  test.afterAll(async () => { await page?.close() })

  test('marketplace renders seeded lifecycle states', async () => {
    await navigate('Marketplace')
    for (const [id, state] of [
      [1, 'Requested'], [2, 'Requested'], [3, 'Requested'], [4, 'Requested'], [5, 'Requested'],
      [6, 'Active'], [7, 'Active'], [8, 'Repaid'], [9, 'Repaid'],
    ] as const) {
      await expect(page.getByRole('button', { name: new RegExp(`^#${id} ·.*${state}`) })).toBeVisible()
    }
    await screenshot('01-marketplace')
    for (const id of [1n, 2n]) {
      await openLoan(id)
      await expect(page.getByText('Oracle assessment: Pending')).toBeVisible()
      if (id === 1n) await screenshot('02-pending-oracle')
    }
    for (const id of [3n, 4n, 5n]) {
      await openLoan(id)
      await expect(page.getByText(/^Oracle assessment: Attested score .* \(not an approval\)$/)).toBeVisible()
    }
    expect(browserErrors).toEqual([])
  })

  test('borrower assesses and requests a loan', async () => {
    await navigate('Apply for Loan')
    await page.getByLabel('Requested amount (RM)').fill('1000')
    await page.getByLabel('Annual interest (basis points)').fill('1000')
    await page.getByLabel('Duration (days)').fill('180')
    await page.getByLabel('Borrow frequency').fill('1')
    await page.getByLabel('Repayment velocity').fill('0.9')
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/predict-risk') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Get risk assessment' }).click()
    const response = await responsePromise
    expect(response.ok()).toBeTruthy()
    const result = await response.json() as { risk_score: number; approved: boolean }
    expect(result.approved).toBe(true)
    score = result.risk_score.toString()
    await expect(page.getByText(result.risk_score.toFixed(4), { exact: true })).toBeVisible()
    await expect(page.getByText('Eligible according to model')).toBeVisible()
    await screenshot('03-advisory')
    await page.getByRole('button', { name: 'Request loan on-chain' }).click()
    await confirmTransaction()
    const provider = new JsonRpcProvider('http://127.0.0.1:18545', undefined, { cacheTimeout: -1 })
    try { loanId = await new Contract(address, abi, provider).loanCount() } finally { provider.destroy() }
    expect(loanId).toBe(10n)
    await openLoan(loanId)
    await expect(page.getByText('Oracle assessment: Pending')).toBeVisible()
    await screenshot('04-requested')
  })

  test('manual local oracle attests the new request', async () => {
    await verifyLocalNode()
    const provider = new JsonRpcProvider('http://127.0.0.1:18545', undefined, { cacheTimeout: -1 })
    try {
      const oracle = new Contract(address, abi, await provider.getSigner(0))
      const hash = keccak256(toUtf8Bytes(JSON.stringify({ kind: 'local-demo', loanId: loanId.toString(), score })))
      await (await oracle.submitRiskAssessment(loanId, parseEther(score), hash)).wait()
    } finally { provider.destroy() }
    await openLoan(loanId)
    await expect(page.getByText(`Oracle assessment: Attested score ${parseFloat(score)} (not an approval)`)).toBeVisible()
    await expect(page.getByText('State: Requested')).toBeVisible()
    await screenshot('05-attested')
  })

  test('lender funds the full principal', async () => {
    await switchAccount(page, 4)
    await openLoan(loanId)
    await page.getByRole('button', { name: 'Fund full 0.1 native tokens' }).click()
    await confirmTransaction()
    await expect(page.getByText('State: Active')).toBeVisible()
    await screenshot('06-funded')
  })

  test('borrower repays in full', async () => {
    await switchAccount(page, 1)
    await openLoan(loanId)
    await page.getByRole('button', { name: /^Repay full .* native tokens$/ }).click()
    await confirmTransaction()
    await expect(page.getByText('State: Repaid')).toBeVisible()
    await screenshot('07-repaid')
  })

  test('wrong network blocks reads and unavailable features remain disabled', async () => {
    await switchChain(page, '0x1')
    await expect(page.getByRole('alert').filter({ hasText: 'Switch wallet to chain 31337' })).toBeVisible()
    await navigate('Apply for Loan')
    await page.getByLabel('Requested amount (RM)').fill('1000')
    await page.getByRole('button', { name: 'Get risk assessment' }).click()
    await expect(page.getByText('Switch your wallet to chain 31337.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Request loan on-chain' })).toHaveCount(0)
    await screenshot('08-wrong-network')
    await switchChain(page, '0x7a69')
    await navigate('AI Insights')
    await expect(page.getByText('No verified metric is provided.')).toHaveCount(4)
    await screenshot('09-unavailable-analytics')
    await navigate('Compliance')
    await expect(page.getByRole('button', { name: 'Block & blacklist — unavailable' })).toBeDisabled()
    await navigate('Help & Disputes')
    await expect(page.getByRole('button', { name: 'Submit support ticket — unavailable' })).toBeDisabled()
    await navigate('My Portfolio')
    await page.getByRole('button', { name: 'About auto-invest (unavailable)' }).click()
    await expect(page.getByRole('button', { name: 'Save auto-invest rules — unavailable' })).toBeDisabled()
    await screenshot('10-disabled-autoinvest')
    expect(browserErrors).toEqual([])
  })
})
