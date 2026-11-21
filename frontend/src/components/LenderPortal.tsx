import { useState } from 'react'
import { AutoInvestModal } from './AutoInvestModal'
import { LoanList } from './LoanList'

export function LenderPortal({ version, onSelect, active = true }: { version: number; onSelect: (id: bigint) => void; active?: boolean }) {
  const [autoInvestOpen, setAutoInvestOpen] = useState(false)
  return <>
    <LoanList scope="lender" version={version} onSelect={onSelect} active={active} />
    <section className="card">
      <h2>Portfolio and repayments</h2>
      <p className="hint">The contract pays the lender directly when the borrower makes one full repayment. There is no separate yield claim or auto-invest action.</p>
      <button className="secondary action" type="button" onClick={() => setAutoInvestOpen(true)}>About auto-invest (unavailable)</button>
    </section>
    {active && autoInvestOpen && <AutoInvestModal onClose={() => setAutoInvestOpen(false)} />}
  </>
}
