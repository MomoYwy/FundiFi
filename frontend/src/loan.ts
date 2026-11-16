export type LoanTier = 'tier1' | 'tier2'

export function isAmountInTier(amount: number, tier: LoanTier): boolean {
  return Number.isFinite(amount) && (tier === 'tier1'
    ? amount >= 500 && amount <= 3000
    : amount >= 3001 && amount <= 15000)
}
