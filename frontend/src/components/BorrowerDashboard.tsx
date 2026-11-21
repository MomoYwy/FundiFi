import { LoanList } from './LoanList'

export function BorrowerDashboard({ version, onApply, onMyLoans, onMarketplace, onSelect }: {
  version: number
  onApply: () => void
  onMyLoans: () => void
  onMarketplace: () => void
  onSelect: (id: bigint) => void
}) {
  return <>
    <div className="heading"><span className="eyebrow">BORROW WITH CONFIDENCE</span><h1>Borrower Dashboard</h1><p>Risk assessment and single-lender escrow transactions.</p></div>
    <div className="dashboard-grid">
      <section className="card"><span className="eyebrow">YOUR LOANS</span><h2>Loan overview</h2><p className="muted">Review recent requests and repayments read from the escrow contract.</p><button className="secondary action" onClick={onMyLoans}>View My Loans</button></section>
      <section className="card"><span className="eyebrow">QUICK APPLY</span><h2>Request a loan</h2><p className="muted">Get a risk assessment before submitting a request.</p><button className="primary action" onClick={onApply}>Apply for Loan →</button></section>
      <section className="card"><span className="eyebrow">MARKETPLACE</span><h2>Fund a loan</h2><p className="muted">Browse requests funded by one lender in full.</p><button className="secondary action" onClick={onMarketplace}>View Marketplace</button></section>
    </div>
    <LoanList scope="borrower" version={version} onSelect={onSelect} />
  </>
}
