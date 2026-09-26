# Project Architecture: AI-Driven P2P Micro-Lending Platform

## Tech Stack
- **Smart Contracts:** Hardhat, Solidity 0.8.20, OpenZeppelin.
- **Backend:** Python 3.10+, FastAPI, Uvicorn, XGBoost, Scikit-Learn.
- **Frontend:** React.js, Ethers.js (v6), TailwindCSS.

## Core Rules & Requirements
1. **Tiered Loan Caps:** Tier 1 (RM 500 – RM 3,000), Tier 2 (RM 3,001 – RM 15,000).
2. **Privacy:** Zero MyKad or raw personal data on-chain. Authenticate via MetaMask wallet address only.
3. **AI Risk Scoring:** FastAPI endpoint `/predict-risk` must return risk score (0.0 to 1.0) and status in <2 seconds.
