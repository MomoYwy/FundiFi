# FundiFi risk assessment frontend

This phase adapts the Figma borrower's dark, lime-accented presentation for the existing `P2PLendingEscrow` architecture: one lender provides the exact principal and the borrower repays the full principal plus interest. There are no pooled loans or installment schedules. The rest of the Figma export contains simulated account and transaction data and is intentionally not exposed as live functionality.

## Local setup

1. Install the root Python dependencies and start the API from the repository root: `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`.
2. Run `npm install --prefix frontend` and `npm run dev --prefix frontend`. Use `http://localhost:5173` or `http://localhost:3000`, the origins currently allowed by the backend. Vite may choose another port if these are occupied; that port, `127.0.0.1`, and other hosts are not allowed by the default CORS configuration.
3. Optionally copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`. Restart Vite after changing it. The API URL must be reachable by the browser and allow the frontend's exact origin. Use HTTPS for deployments and configure the backend's allowed origins appropriately; do not put secrets in Vite variables.

`VITE_HARDHAT_RPC_URL` documents the local RPC endpoint for a later phase; it is not read or connected here. After `npx hardhat compile` at the repository root, the Vite and TypeScript `@artifacts/*` alias can resolve generated Hardhat JSON artifacts, for example `@artifacts/contracts/P2PLendingEscrow.sol/P2PLendingEscrow.json`; no artifact, wallet, or contract is loaded in this phase.

## API contract and limits

`src/api/schema.d.ts` is generated from FastAPI's OpenAPI schema. With the API running on localhost:8000, run `npm run generate:api --prefix frontend` after changing backend schemas and commit the regenerated file. The client also checks responses at runtime.

The form sends the four fields required by `/predict-risk`. The wallet address is manually entered and is not authenticated. Borrow frequency (number of loans in the previous 90 days) and repayment velocity (share paid on time or early, from 0 to 1) are self-reported: there is no trusted history service. Never invent them. The API's `approved` is displayed only as a model advisory, not a loan approval, on-chain attestation, identity verification, or transaction. Model availability is shown by `/health`; if models are absent, prediction returns 503. Existing training uses synthetic data and is not evidence of real-world model performance.

Run `npm run test --prefix frontend`, `npm run typecheck --prefix frontend`, `npm run lint --prefix frontend`, and `npm run build --prefix frontend`.
