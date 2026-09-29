# Hardhat Test Suite

Location: [`test/P2PLendingEscrow.test.js`](../../test/P2PLendingEscrow.test.js)

## Setup

Hardhat 3's Mocha/ethers testing stack is wired in [`hardhat.config.ts`](../../hardhat.config.ts) via three plugins:

- `@nomicfoundation/hardhat-ethers` — exposes `ethers` on a network connection.
- `@nomicfoundation/hardhat-mocha` — runs `.test.js`/`.test.ts` files under `test/` with Mocha.
- `@nomicfoundation/hardhat-ethers-chai-matchers` — adds Chai matchers such as `revertedWithCustomError`.

Each test creates its own network connection with `network.create()` (the non-deprecated replacement for `network.connect()`) and deploys a fresh `P2PLendingEscrow` in `beforeEach`.

## Running the tests

```powershell
npx hardhat test
```

Or, to run only the Mocha suite:

```powershell
npx hardhat test mocha
```

## Coverage

| Test                                                             | What it verifies                                                                                                                                           |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funds a requested loan and repays principal plus annual interest | Full happy path: request → risk assessment → fund → repay, including exact borrower/lender balance deltas and the computed repayment amount                |
| Accepts the Tier 2 lower boundary at RM 3,001 equivalent         | The tier cap boundary is inclusive at the documented lower bound                                                                                           |
| Rejects funding until the risk oracle submits an assessment      | `fundLoan` reverts with `RiskAssessmentPending` when called before `submitRiskAssessment` — this is a regression test for the self-reported-risk-score fix |
| Blocks new loan requests while paused                            | `requestLoan` reverts with `EnforcedPause` after `PAUSER_ROLE` calls `pause()`                                                                             |

## Not Yet Covered

The following are documented as gaps rather than silently assumed to work — add tests here before relying on this behavior in production:

- `markDefaulted` (requires manipulating block timestamps past the loan duration).
- Rejection paths for `InvalidLoanAmount` (out-of-tier principal), `InvalidInterestRate`, and `InvalidDuration` boundary values.
- `BorrowerCannotFundOwnLoan` and `BorrowerOnly` unauthorized-caller paths.
- `RiskAssessmentAlreadySubmitted` (double submission by the oracle).
- `unpause()` restoring normal operation.
