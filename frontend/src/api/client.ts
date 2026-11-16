import type { components } from './schema'

export type RiskRequest = components['schemas']['RiskRequest']
export type RiskResponse = components['schemas']['RiskResponse']
export type HealthResponse = components['schemas']['HealthResponse']

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request(path: string, options?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, options)
  } catch {
    throw new ApiError('Cannot reach the risk API. Check the server and its CORS configuration.')
  }
  if (!response.ok) {
    if (response.status === 422) throw new ApiError('The API rejected one or more inputs. Check the address, amount and history values.', 422)
    if (response.status === 500) throw new ApiError('Risk inference failed on the server. Please try again later.', 500)
    if (response.status === 503) throw new ApiError('Risk models are unavailable. The API operator must load the models.', 503)
    throw new ApiError(`The API returned an unexpected error (${response.status}).`, response.status)
  }
  try {
    return await response.json() as unknown
  } catch {
    throw new ApiError('The API returned an invalid response.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function getHealth(): Promise<HealthResponse> {
  const data = await request('/health')
  if (!isRecord(data) || data.status !== 'ok' || typeof data.models_loaded !== 'boolean') {
    throw new ApiError('The API returned an invalid health response.')
  }
  return { status: data.status, models_loaded: data.models_loaded }
}

export async function predictRisk(input: RiskRequest): Promise<RiskResponse> {
  const data = await request('/predict-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!isRecord(data) || typeof data.risk_score !== 'number' ||
      !Number.isFinite(data.risk_score) || data.risk_score < 0 || data.risk_score > 1 ||
      typeof data.approved !== 'boolean' ||
      (data.risk_category !== 'LOW' && data.risk_category !== 'MEDIUM' && data.risk_category !== 'HIGH')) {
    throw new ApiError('The API returned an invalid risk response.')
  }
  return { risk_score: data.risk_score, approved: data.approved, risk_category: data.risk_category }
}
