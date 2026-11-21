import { LoanList } from './LoanList'

export function Marketplace({ version, onSelect, scope = 'all', active = true }: {
  version: number
  onSelect: (id: bigint) => void
  scope?: 'all' | 'borrower'
  active?: boolean
}) {
  return <LoanList scope={scope} version={version} onSelect={onSelect} active={active} />
}
