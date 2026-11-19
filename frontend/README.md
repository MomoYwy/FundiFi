# FundiFi frontend

The borrower form requests an off-chain advisory risk assessment and then permits a wallet-signed loan request. A connected wallet can browse the latest 30 on-chain loans or look up a loan ID, fund an attested request in full, or repay its own active loan in full. There are no pools or installments.

## Local setup

Follow the [root startup guide](../README.md) for first-time installation, the `npm run dev` shortcut, and optional API setup. The shortcut fixes the UI to `http://localhost:5173`, an origin allowed by the backend.

Optionally copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`. Restart Vite after changing it. The API URL must be reachable by the browser and allow the frontend's exact origin. Use HTTPS for deployments and configure the backend's allowed origins appropriately; do not put secrets in Vite variables.

`VITE_HARDHAT_RPC_URL` documents the local RPC endpoint for a later phase; it is not read or connected here. After `npx hardhat compile` at the repository root, the Vite and TypeScript `@artifacts/*` alias can resolve generated Hardhat JSON artifacts, for example `@artifacts/contracts/P2PLendingEscrow.sol/P2PLendingEscrow.json`; no artifact, wallet, or contract is loaded in this phase.

## API contract and limits

`src/api/schema.d.ts` is generated from FastAPI's OpenAPI schema. With the API running on localhost:8000, run `npm run generate:api --prefix frontend` after changing backend schemas and commit the regenerated file. The client also checks responses at runtime.

## Important limitations

The API returns a score, category and advisory boolean, not a risk hash or an on-chain approval. Borrowing and repayment history is self-reported, not verified by a trusted service, and training uses synthetic data. A requested loan is not approved merely because the model returned an eligible result. A separate holder of `RISK_ORACLE_ROLE` must submit an attestation after loan creation; this project does not implement that service or a trusted approval policy. The contract permits funding after **any** valid oracle score, not only an approved score. Users must assess the risks independently. No raw history or identity data is sent on-chain.

The RM amount is converted into native-asset wei using the contract's immutable `rmPerEth`. The contract's actual RM-equivalent must exactly match the amount assessed by the API and remain within the tier; amounts that cannot be represented exactly are rejected. The exact native amount is displayed before signing. Interest is entered in basis points and duration in days; repayment uses the contract's `repaymentAmount` rather than a monthly schedule. A transaction can still fail if on-chain state changes before confirmation. If confirmation is interrupted, check its hash on the network before retrying.

Disconnect removes the app's local connection state; it does not revoke wallet permissions. Revoke them in MetaMask if needed. Account or chain changes invalidate the current assessment and loan view.

## Checks

Run `npm run test --prefix frontend`, `npm run typecheck --prefix frontend`, `npm run lint --prefix frontend`, and `npm run build --prefix frontend`. To run the optional real-contract integration test, start an isolated local Hardhat node on port 18545 (`npx hardhat node --hostname 127.0.0.1 --port 18545`), then in another PowerShell terminal run `$env:FUNDIFI_RPC_TEST='http://127.0.0.1:18545'; npm run test --prefix frontend -- src/web3/escrow.integration.test.ts`. The test deploys its own contract and uses the node's unlocked test accounts.
