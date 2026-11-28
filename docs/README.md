# FundiFi Documentation

This folder documents the parts of the system that currently exist in the repository. It does not describe planned features until they are implemented and tested — see [`AGENTS.md`](../AGENTS.md) and [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) for binding project rules.

## Contents

- [`contracts/P2PLendingEscrow.md`](./contracts/P2PLendingEscrow.md) — Reference for the `P2PLendingEscrow` smart contract: state machine, roles, functions, events, errors, storage layout, and security notes.
- [`testing/hardhat-tests.md`](./testing/hardhat-tests.md) — How the Hardhat/Mocha test suite is set up, what it covers, and how to run it.
- [`testing/ui-business-logic-template.md`](./testing/ui-business-logic-template.md) — Reusable procedure for local UI business-logic checks with screenshots.
- [`frontend/overview.md`](./frontend/overview.md) — Current state of the React/Vite frontend scaffold.
- [`backend/overview.md`](./backend/overview.md) — Reference for the FastAPI risk API and training script.
- [`backend/kaggle-training.md`](./backend/kaggle-training.md) — Running training on Kaggle and moving to a real Kaggle dataset.

## Status Summary

| Component              | State                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| `P2PLendingEscrow.sol` | Implemented and tested (see contract doc)                                    |
| Hardhat test suite     | 4 passing tests covering funding, repayment, tier caps, risk-gate, and pause |
| React frontend         | Default Vite scaffold only; no contract or API integration yet               |
| Python backend         | FastAPI `/predict-risk` and training script implemented (synthetic data)     |
