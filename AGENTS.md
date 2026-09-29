# FundiFi Project Guidance

Read this file and `.github/copilot-instructions.md` before making project changes. The Copilot instructions contain the current binding project rules; this file adds context, workflow guidance, and implementation boundaries. Keep both documents consistent when project requirements change.

## Project Purpose

FundiFi is a prototype P2P micro-lending platform combining an off-chain Python risk-scoring API, an EVM smart-contract escrow system, and a React web application. Borrowers submit applications, the backend returns an AI risk assessment, approved loans can be listed and funded on-chain, and loan status and repayments are presented in the frontend.

The repository is currently at the initial setup stage. It contains a Hardhat 3 project configuration, a Vite React frontend, and Python dependencies; it does not yet contain the lending API, trained models, Solidity contracts, or end-to-end integration. Do not describe those features as implemented until they exist and have been tested.

## Stack and Local Environment

- Contracts: Solidity 0.8.20, Hardhat 3, OpenZeppelin Contracts.
- Backend: Python 3.10+, FastAPI, Uvicorn, XGBoost, scikit-learn, pandas, NumPy, and joblib.
- Frontend: React, Vite, Tailwind CSS 4, Ethers.js 6, and Axios.
- Current local versions observed during setup: Node.js 24.14.0, Python 3.14.3. The Python virtual environment is `.venv`.

Use the project manifests as the source of truth for dependencies. On Windows PowerShell, typical setup and checks are:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
npm install
npm install --prefix frontend
npx hardhat compile
npm run build --prefix frontend
```

The frontend has its own `package.json`. Run its lint check with `npm run lint --prefix frontend`. Add or update tests alongside behavior changes and run the narrow relevant checks first.

## Binding Product Requirements

- Enforce the currently documented loan caps: Tier 1 is RM 500–RM 3,000 and Tier 2 is RM 3,001–RM 15,000. Do not invent or enable a third tier without an explicit requirements update.
- Never put MyKad data, raw personal information, or other PII on-chain. Keep sensitive identity and behavioral data off-chain; minimize and protect it there as well.
- Use the connected wallet address as the on-chain user identity. Do not introduce custodial key handling.
- The `/predict-risk` API is expected to return a risk score in the inclusive range 0.0–1.0 and a status, with response time under 2 seconds.
- Validate request and response data, handle inference failures explicitly, and do not approve a loan solely because a model returned a score without applying the defined business rules.

## Architecture Boundaries

- The backend owns risk inference and off-chain application data. The frontend calls it over structured JSON APIs.
- The contract owns authoritative financial state: loan creation, funding totals, funding completion, repayment state, and events. Do not trust frontend state for authorization or financial accounting.
- Only publish the minimum loan information needed for funding and audit. Link off-chain records to chain activity using transaction hashes or non-sensitive cryptographic commitments, never raw applicant data.
- The frontend uses Ethers.js 6 with the user's wallet provider for user-authorized transactions. Handle missing wallets, rejected signatures/transactions, pending transactions, and failed API requests.
- Keep model training and inference separate enough that the API can start and respond predictably even when optional training data is unavailable. Never fabricate model accuracy or risk outputs.

## Security and Quality

- Use established OpenZeppelin components for access control and reentrancy protection in contracts. Apply checks-effects-interactions, validate state transitions, and test unauthorized calls, boundary amounts, repeated actions, and failed transfers.
- Keep secrets, private keys, credentials, and local environment files out of source control. Use environment variables and commit only safe example configuration.
- Treat model outputs as advisory application data, not proof of identity or a guarantee of repayment. Avoid logging PII, wallet-linked sensitive features, or secrets.
- Preserve clear module boundaries and existing conventions. Prefer small, testable changes; avoid unrelated scaffolding and do not claim regulatory compliance or production readiness without evidence.

## Requirement Differences to Resolve Carefully

Some supplied planning material is broader than the current project instructions. Until the owner updates `.github/copilot-instructions.md`, follow its Tier 1/Tier 2 limits and `/predict-risk` endpoint with the under-2-second target. The blueprint's proposed Tier 3, versioned API route, and sub-500ms p95 latency are future or conflicting targets, not permission to silently change current behavior. Ask for clarification before implementing a conflicting requirement.
