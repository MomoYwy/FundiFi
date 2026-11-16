// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { isAmountInTier } from './loan'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('respects contract tier boundaries including the gap', () => {
  expect([499, 500, 3000, 3000.5, 3001, 15000, 15001].map(amount =>
    [isAmountInTier(amount, 'tier1'), isAmountInTier(amount, 'tier2')])).toEqual([
    [false, false], [true, false], [true, false], [false, false], [false, true], [false, true], [false, false],
  ])
})

it('shows loading and real assessment, then clears it when inputs change', async () => {
  let resolveResponse: (response: Response) => void = () => { throw new Error('Request not started') }
  const pending = new Promise<Response>(resolve => { resolveResponse = resolve })
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', models_loaded: true }))).mockReturnValueOnce(pending)
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)
  await screen.findByText('Service available · models loaded')
  fireEvent.change(screen.getByLabelText('Requested amount (RM)'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('Wallet address'), { target: { value: `0x${'a'.repeat(40)}` } })
  fireEvent.change(screen.getByLabelText('Borrow frequency'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Repayment velocity'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: /get risk assessment/i }))
  expect(screen.getByText('Waiting for the risk API…')).toBeTruthy()
  resolveResponse(new Response(JSON.stringify({ risk_score: 0.48, approved: true, risk_category: 'MEDIUM' })))
  await screen.findByText('0.4800')
  expect(screen.getByText('MEDIUM')).toBeTruthy()
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ wallet_address: `0x${'a'.repeat(40)}`, requested_amount: 500, borrow_frequency: 0, repayment_velocity: 1 })
  fireEvent.change(screen.getByLabelText('Borrow frequency'), { target: { value: '1' } })
  await waitFor(() => expect(screen.queryByText('0.4800')).toBeNull())
})

it('shows an API error without presenting a risk result', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', models_loaded: false })))
    .mockResolvedValueOnce(new Response('', { status: 503 })))
  render(<App />)
  await screen.findByText('Service available · models not loaded')
  fireEvent.change(screen.getByLabelText('Requested amount (RM)'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('Wallet address'), { target: { value: `0x${'a'.repeat(40)}` } })
  fireEvent.change(screen.getByLabelText('Borrow frequency'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Repayment velocity'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: /get risk assessment/i }))
  expect((await screen.findByRole('alert')).textContent).toContain('models are unavailable')
  expect(screen.queryByText('Risk category:')).toBeNull()
})
