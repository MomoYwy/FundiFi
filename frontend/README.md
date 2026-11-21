# FundiFi frontend

The borrower form requests an off-chain advisory risk assessment and then permits a wallet-signed loan request. A connected wallet can browse the latest 30 on-chain loans or look up a loan ID, fund an attested request in full, or repay its own active loan in full. There are no pools or installments.

Borrower dashboard, marketplace, borrower-loan list, lender portfolio, and loan-detail views use the typed API and escrow read/transaction helpers. Wallet, transaction, activity, and contract-inspector panels are available. View modes are presentation only and do not grant roles. My Loans and My Portfolio filter only the latest 30 requests, not a complete account history; use loan ID lookup for older loans. Activity reads contract-wide confirmed lifecycle events on demand over a bounded range. The inspector can read loan count and current block from the connected network; it does not establish contract identity or audit status. AI Insights and Compliance show unavailable metrics, not live analytics or evidence of regulatory compliance. Support ticket forms and auto-invest settings are disabled; no data is submitted or saved. Compliance overrides, blacklisting, yield claims and auto-invest remain unavailable.

Loan details can load lifecycle events on demand for the selected loan. The read covers at most the latest 2,000 blocks ending one block behind the observed chain head (at least two confirmations); it is not an index, complete history, automatic poller, or guarantee against reorganizations. RPC providers may limit log queries; failures are reported rather than shown as empty results.

## Local setup

1. Install dependencies with `npm install` and `npm install --prefix frontend`. Compile the escrow with `npx hardhat compile`. After contract changes, run `npm run generate:abi --prefix frontend` to regenerate the checked-in ABI from the Hardhat artifact.
2. Deploy `P2PLendingEscrow` to the intended EVM network with an appropriate RM-per-ETH rate. Copy `frontend/.env.example` to `frontend/.env`, set `VITE_ESCROW_ADDRESS` to the deployed contract and `VITE_CHAIN_ID` to its decimal chain ID. Optionally set `VITE_EXPLORER_URL` to that network's explorer base URL. Verify the deployment address and network independently before signing. Vite settings are public; do not put secrets in them.
3. Configure MetaMask for the same network (a local Hardhat node commonly uses chain ID 31337 and RPC `http://127.0.0.1:8545`). The application uses the wallet provider, not a separately configured RPC. Local Hardhat accounts and their keys are for testing only.
4. Start the API from the repository root with `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`, and start the frontend with `npm run dev --prefix frontend`. Use `http://localhost:5173` or `http://localhost:3000`, the origins currently allowed by the API. Configure backend CORS if using a different exact origin. Set `VITE_API_BASE_URL` if the API is elsewhere, and restart Vite after changing environment variables.

`src/api/schema.d.ts` is generated from FastAPI's OpenAPI schema. With the API running on localhost:8000, run `npm run generate:api --prefix frontend` after changing backend schemas and commit the regenerated file. The client also checks responses at runtime.

## Important limitations

The API returns a score, category and advisory boolean, not a risk hash or an on-chain approval. Borrowing and repayment history is self-reported, not verified by a trusted service, and training uses synthetic data. A requested loan is not approved merely because the model returned an eligible result. A separate holder of `RISK_ORACLE_ROLE` must submit an attestation after loan creation; this project does not implement that service or a trusted approval policy. The contract permits funding after **any** valid oracle score, not only an approved score. Users must assess the risks independently. No raw history or identity data is sent on-chain.

The RM amount is converted into native-asset wei using the contract's immutable `rmPerEth`. The contract's actual RM-equivalent must exactly match the amount assessed by the API and remain within the tier; amounts that cannot be represented exactly are rejected. The exact native amount is displayed before signing. Interest is entered in basis points and duration in days; repayment uses the contract's `repaymentAmount` rather than a monthly schedule. A transaction can still fail if on-chain state changes before confirmation. If confirmation is interrupted, check its hash on the network before retrying.

Disconnect removes the app's local connection state; it does not revoke wallet permissions. Revoke them in MetaMask if needed. Account or chain changes invalidate the current assessment and loan view.

## Checks

Run `npm run test --prefix frontend`, `npm run typecheck --prefix frontend`, `npm run lint --prefix frontend`, and `npm run build --prefix frontend`. To run the optional real-contract integration test, start an isolated local Hardhat node on port 18545 (`npx hardhat node --hostname 127.0.0.1 --port 18545`), then in another PowerShell terminal run `$env:FUNDIFI_RPC_TEST='http://127.0.0.1:18545'; npm run test --prefix frontend -- src/web3/escrow.integration.test.ts`. The test deploys its own contract and uses the node's unlocked test accounts.

The ordinary frontend suite skips the local-RPC integration test unless `FUNDIFI_RPC_TEST` is set. Before using a testnet deployment, independently verify its address, network and oracle setup, then exercise wallet connect and account/network changes, request, oracle attestation, exact funding, repayment, rejection and failed transaction handling. Automated mocks and local tests do not establish live testnet behavior.
