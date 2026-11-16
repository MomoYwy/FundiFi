import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getHealth, predictRisk } from './client'

const request = { wallet_address: `0x${'a'.repeat(40)}`, requested_amount: 500, borrow_frequency: 0, repayment_velocity: 1 }

afterEach(() => vi.unstubAllGlobals())

describe('risk API', () => {
  it('sends the exact request and accepts a valid response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ risk_score: 0.24, approved: true, risk_category: 'LOW' })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await predictRisk(request)).toEqual({ risk_score: 0.24, approved: true, risk_category: 'LOW' })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/predict-risk', expect.objectContaining({ method: 'POST', body: JSON.stringify(request) }))
  })

  it.each([[422, 'rejected'], [500, 'inference failed'], [503, 'unavailable']])('reports HTTP %i explicitly', async (status, text) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(predictRisk(request)).rejects.toThrow(text)
  })

  it('rejects malformed or out-of-range risk data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ risk_score: 1.1, approved: true, risk_category: 'LOW' }))))
    await expect(predictRisk(request)).rejects.toThrow('invalid risk response')
  })

  it('checks health and surfaces network failures', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ status: 'ok', models_loaded: false }))).mockRejectedValueOnce(new TypeError('network'))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getHealth()).toEqual({ status: 'ok', models_loaded: false })
    await expect(getHealth()).rejects.toBeInstanceOf(ApiError)
  })
})
