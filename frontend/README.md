# FundiFi frontend

The borrower form requests an off-chain advisory risk assessment and then permits a wallet-signed loan request. A connected wallet can browse the latest 30 on-chain loans or look up a loan ID, fund an attested request in full, or repay its own active loan in full. There are no pools or installments.

Borrower dashboard, marketplace, borrower-loan list, lender portfolio, and loan-detail views use the typed API and escrow read/transaction helpers. Wallet, transaction, activity, and contract-inspector panels are available. View modes are presentation only and do not grant roles. My Loans and My Portfolio filter only the latest 30 requests, not a complete account history; use loan ID lookup for older loans. Activity reads contract-wide confirmed lifecycle events on demand over a bounded range. The inspector can read loan count and current block from the connected network; it does not establish contract identity or audit status. AI Insights and Compliance show unavailable metrics, not live analytics or evidence of regulatory compliance. Support ticket forms and auto-invest settings are disabled; no data is submitted or saved. Compliance overrides, blacklisting, yield claims and auto-invest remain unavailable.

Loan details can load lifecycle events on demand for the selected loan. The read covers at most the latest 2,000 blocks ending one block behind the observed chain head (at least two confirmations); it is not an index, complete history, automatic poller, or guarantee against reorganizations. RPC providers may limit log queries; failures are reported rather than shown as empty results.

## Local setup

Follow the [root startup guide](../README.md) for first-time installation and `npm run demo`, which starts and seeds the complete disposable local system. `npm run dev` starts only the UI on `http://localhost:5173`, an origin allowed by the backend.

Optionally copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_BASE_URL`. Restart Vite after changing it. The API URL must be reachable by the browser and allow the frontend's exact origin. Use HTTPS for deployments and configure the backend's allowed origins appropriately; do not put secrets in Vite variables.

Set `VITE_ESCROW_ADDRESS` and `VITE_CHAIN_ID` to the deployed contract and its network. The wallet supplies the RPC connection; a `VITE_HARDHAT_RPC_URL` variable is not used. After `npx hardhat compile` at the repository root, the Vite and TypeScript `@artifacts/*` alias can resolve generated Hardhat JSON artifacts.

## Seed local demo loans

For UI testing only, start the unforked default Hardhat node and run the seeder
from a second terminal at the repository root:

```powershell
npx hardhat compile
npx hardhat node --hostname 127.0.0.1 --port 18545
```

```powershell
node scripts\seed-local-demo.js
```

The script connects only to `127.0.0.1:18545`, checks chain ID 31337, the
Hardhat client and default unlocked accounts, and refuses forked networks. It
deploys a **new** escrow on every run; it does not populate an existing address.
Set `VITE_ESCROW_ADDRESS` in `frontend\.env` to the printed address and
`VITE_CHAIN_ID=31337`, then restart Vite. Its table lists account indices,
addresses, IDs, tiers and RM amounts for two pending-oracle requests, three
attested open requests, two active loans and two repaid loans. Account 0 is
the oracle, accounts 1-3 are borrowers and 4-5 are lenders. The scores are
synthetic, not API assessments or lending approvals. A failed run can leave
a partially seeded deployment; rerun to create a fresh one. State is lost on
node restart. Use these publicly known test accounts only on disposable local
networks, never with real funds.

## Local end-to-end demonstration

These are disposable local test transactions, not a production oracle or a trusted approval system. Use a separate MetaMask test wallet, never real funds or real private keys. Run commands from the repository root in separate PowerShell terminals:

1. Install dependencies if needed with `npm ci`, `npm ci --prefix frontend`, and `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`. Create the virtual environment first with `python -m venv .venv` if it is missing.
2. Compile and start the local chain:

   ```powershell
   npx hardhat compile
   npx hardhat node --hostname 127.0.0.1 --port 18545
   ```

3. In another terminal deploy the escrow. This uses the node's unlocked, publicly known test account 0 as deployer and oracle and an example rate of RM 10,000 per native token. The address and state disappear when the local node is restarted.

   ```powershell
   @'
   import { readFileSync } from 'node:fs'
   import { ContractFactory, JsonRpcProvider, parseEther } from 'ethers'
   const provider = new JsonRpcProvider('http://127.0.0.1:18545')
   try {
     const artifact = JSON.parse(readFileSync('artifacts/contracts/P2PLendingEscrow.sol/P2PLendingEscrow.json', 'utf8'))
     const deployer = await provider.getSigner(0)
     const escrow = await new ContractFactory(artifact.abi, artifact.bytecode, deployer).deploy(parseEther('10000'))
     await escrow.waitForDeployment()
     console.log('ESCROW_ADDRESS=' + await escrow.getAddress())
     console.log('ORACLE=' + await deployer.getAddress())
   } finally { provider.destroy() }
   '@ | node --input-type=module
   ```

4. Configure MetaMask for RPC `http://127.0.0.1:18545`, chain ID `31337`, using two different **local test accounts** for borrower and lender. Copy `frontend\.env.example` to `frontend\.env` if needed, set `VITE_ESCROW_ADDRESS` to the printed address, `VITE_CHAIN_ID=31337` and `VITE_API_BASE_URL=http://localhost:8000`. Restart Vite after editing. Never put keys in `.env` or Vite variables.
5. Start the API and frontend in separate terminals:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   ```

   ```powershell
   npm run dev
   ```

   Check `http://localhost:8000/health` reports `models_loaded: true`, then open `http://localhost:5173`. The bundled model artifacts are synthetic; if they are missing, the root guide describes generating synthetic artifacts. Model/package compatibility errors require an appropriate matching environment. Do not replace them with experimental research models.
6. Connect the borrower test account, submit a risk assessment and create a loan request. Record the loan ID and advisory score. The API does **not** attest it or approve the loan. To demonstrate the separate oracle action, replace only the address, loan ID, and score below with the local values and run this in another terminal. It sends a demo commitment containing no applicant history. This does not establish authenticity, a production policy, or a trustworthy link to the API response.

   ```powershell
   @'
   import { readFileSync } from 'node:fs'
   import { Contract, JsonRpcProvider, keccak256, parseEther, toUtf8Bytes } from 'ethers'
   const address = 'REPLACE_WITH_LOCAL_ESCROW_ADDRESS'
   const loanId = 1n // Replace with the requested loan ID.
   const score = '0.0013' // Replace with the advisory score, in the range 0 to 1.
   const provider = new JsonRpcProvider('http://127.0.0.1:18545')
   try {
     const abi = JSON.parse(readFileSync('artifacts/contracts/P2PLendingEscrow.sol/P2PLendingEscrow.json', 'utf8')).abi
     const oracle = new Contract(address, abi, await provider.getSigner(0))
     const hash = keccak256(toUtf8Bytes(JSON.stringify({ kind: 'local-demo', loanId: loanId.toString(), score })))
     const tx = await oracle.submitRiskAssessment(loanId, parseEther(score), hash)
     await tx.wait()
     console.log('Attestation transaction: ' + tx.hash)
   } finally { provider.destroy() }
   '@ | node --input-type=module
   ```

7. Refresh the loan, switch to the lender test account and fund the full principal. Switch back to the borrower account and repay the full displayed amount. The wallet must hold enough local test currency for the transaction and gas. Inspect transaction statuses and optionally load the bounded lifecycle events. Stop the local terminals when finished.

## API contract and limits

`src/api/schema.d.ts` is generated from FastAPI's OpenAPI schema. With the API running on localhost:8000, run `npm run generate:api --prefix frontend` after changing backend schemas and commit the regenerated file. The client also checks responses at runtime.

## Important limitations

The API returns a score, category and advisory boolean, not a risk hash or an on-chain approval. Borrowing and repayment history is self-reported, not verified by a trusted service, and training uses synthetic data. A requested loan is not approved merely because the model returned an eligible result. A separate holder of `RISK_ORACLE_ROLE` must submit an attestation after loan creation; this project does not implement that service or a trusted approval policy. The contract permits funding after **any** valid oracle score, not only an approved score. Users must assess the risks independently. No raw history or identity data is sent on-chain.

The RM amount is converted into native-asset wei using the contract's immutable `rmPerEth`. The contract's actual RM-equivalent must exactly match the amount assessed by the API and remain within the tier; amounts that cannot be represented exactly are rejected. The exact native amount is displayed before signing. Interest is entered in basis points and duration in days; repayment uses the contract's `repaymentAmount` rather than a monthly schedule. A transaction can still fail if on-chain state changes before confirmation. If confirmation is interrupted, check its hash on the network before retrying.

Disconnect removes the app's local connection state; it does not revoke wallet permissions. Revoke them in MetaMask if needed. Account or chain changes invalidate the current assessment and loan view.

## Checks

Run `npm run test --prefix frontend`, `npm run typecheck --prefix frontend`, `npm run lint --prefix frontend`, and `npm run build --prefix frontend`. To run the optional real-contract integration test, start an isolated local Hardhat node on port 18545 (`npx hardhat node --hostname 127.0.0.1 --port 18545`), then in another PowerShell terminal run `$env:FUNDIFI_RPC_TEST='http://127.0.0.1:18545'; npm run test --prefix frontend -- src/web3/escrow.integration.test.ts`. The test deploys its own contract and uses the node's unlocked test accounts.

The ordinary frontend suite skips the local-RPC integration test unless `FUNDIFI_RPC_TEST` is set. Before using a testnet deployment, independently verify its address, network and oracle setup, then exercise wallet connect and account/network changes, request, oracle attestation, exact funding, repayment, rejection and failed transaction handling. Automated mocks and local tests do not establish live testnet behavior.

### Local browser E2E

These Playwright tests use a test-only injected wallet, not MetaMask. They send real
transactions only to a freshly seeded escrow on an unforked default Hardhat node
at `127.0.0.1:18545`. Never use these publicly known accounts with real funds.
The tests exercise the local synthetic API model, not the research baseline.

Install Chromium once with `npx --prefix frontend playwright install chromium`.
With project dependencies and the synthetic API artifacts already installed,
run the following from the repository root in separate PowerShell terminals.
Ensure ports 18545, 8000 and 5173 are free and do not reuse an unknown service.

```powershell
npx hardhat node --hostname 127.0.0.1 --port 18545
```

```powershell
node scripts\seed-local-demo.js
```

Copy the printed escrow address; the script deploys a new contract each time.
Start the API and confirm `http://localhost:8000/health` reports loaded models:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Start Vite with the printed address without modifying `.env`:

```powershell
$env:VITE_ESCROW_ADDRESS='REPLACE_WITH_PRINTED_ADDRESS'
$env:VITE_CHAIN_ID='31337'
$env:VITE_API_BASE_URL='http://localhost:8000'
npm run dev --prefix frontend -- --host 127.0.0.1 --port 5173 --strictPort
```

Finally run the tests in a separate terminal with the same address:

```powershell
$env:FUNDIFI_E2E_ADDRESS='REPLACE_WITH_PRINTED_ADDRESS'
npm run test:e2e --prefix frontend
```

The tests require exactly nine seed loans and create a tenth. To rerun, seed a
fresh contract and restart Vite with its new address. Screenshots are saved to
the ignored `frontend\test-results\evidence` directory; failures also retain
screenshots and traces, and the HTML report is in `frontend\playwright-report`.
Stop the three local services when finished. Local browser tests do not verify
real MetaMask prompts, wallet permissions or testnet behavior.
