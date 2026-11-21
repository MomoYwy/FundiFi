import { Dialog } from './Dialog'

export function AutoInvestModal({ onClose }: { onClose: () => void }) {
  return <Dialog title="Auto-invest portfolio rules" onClose={onClose}>
    <span className="eyebrow">LENDER SETTINGS</span>
    <p className="notice">Auto-invest is not supported by the current contract or application. No rules can be saved and no funds will be allocated automatically.</p>
    <fieldset disabled>
      <label htmlFor="auto-amount">Maximum investment per loan</label>
      <input id="auto-amount" type="number" />
      <label htmlFor="auto-tier">Loan tier</label>
      <select id="auto-tier" defaultValue=""><option value="">Unavailable</option></select>
      <label htmlFor="auto-rate">Minimum annual interest rate</label>
      <input id="auto-rate" type="number" />
      <button className="primary action" type="button" disabled>Save auto-invest rules — unavailable</button>
    </fieldset>
    <p className="hint">Funding is a wallet-authorized transaction for one loan's entire principal.</p>
  </Dialog>
}
