# Frontend — Current State

Location: [`frontend/`](../../frontend)

## What exists today

The frontend provides a borrower risk-assessment UI using the FastAPI service:

- The form submits a manually entered wallet address and self-reported history to the risk API.
- Results are advisory, not loan approvals or identity verification.
- No MetaMask/wallet connection flow exists.
- No calls to the `P2PLendingEscrow` contract exist.
- No borrower or lender dashboards exist.

See the [startup guide](../../README.md) to run the UI and API.

## Stack

- React 19 + Vite 8
- Tailwind CSS 4 (via `@tailwindcss/vite`, CSS-first configuration — no `tailwind.config.js`)
- Ethers.js 6 (installed, not yet used)
- Axios (installed, not yet used)

## What building the real UI will require

Per `AGENTS.md`'s architecture boundaries, the frontend must not be trusted for financial state — all loan/funding/repayment truth comes from the contract. When this is implemented, it should:

- Use Ethers.js 6 with the injected wallet provider (e.g., MetaMask) for user-authorized transactions only.
- Handle missing wallet, rejected signature/transaction, and pending-transaction states explicitly.
- Call the FastAPI risk-scoring service over structured JSON, not embed risk logic in the frontend.
- Treat contract events (`LoanRequested`, `RiskAssessed`, `LoanFunded`, `LoanRepaid`, `LoanDefaulted`) as the source of truth for displaying loan status, not local/optimistic state.
