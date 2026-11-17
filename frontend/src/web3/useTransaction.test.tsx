// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TransactionResponse } from 'ethers'
import { useTransaction } from './useTransaction'

afterEach(() => vi.unstubAllEnvs())

it('distinguishes rejection and mined failure from success', async () => {
  vi.stubEnv('VITE_ESCROW_ADDRESS', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  vi.stubEnv('VITE_CHAIN_ID', '31337')
  const { result } = renderHook(() => useTransaction())
  await act(async () => { await result.current.run(async () => { throw { code: 4001 } }) })
  expect(result.current.state).toMatchObject({ status: 'error', message: 'Wallet request rejected.' })
  let resolve!: (receipt: { status: number }) => void
  const wait = () => new Promise<{ status: number }>(r => { resolve = r })
  const tx = { hash: '0x123', wait } as TransactionResponse
  let running!: Promise<boolean>
  act(() => { running = result.current.run(async () => tx) })
  await waitFor(() => expect(result.current.state.status).toBe('pending'))
  await act(async () => { resolve({ status: 0 }); await running })
  expect(result.current.state).toMatchObject({ status: 'error', hash: '0x123' })
})
