# FundiFi

FundiFi is a prototype peer-to-peer lending platform. The current UI provides an off-chain risk assessment; wallet connection and on-chain transactions are not yet integrated.

## Start the UI

These commands use PowerShell on Windows. Run them from the repository root.

### First time

1. Install Node.js compatible with Vite 8 (Node.js 20.19+ or 22.12+), including npm.
2. Install the frontend dependencies:

   ```powershell
   npm install --prefix frontend
   ```

### Every time

```powershell
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Leave the terminal running; press **Ctrl+C** to stop the server. No Python, MetaMask, or blockchain node is needed just to view the UI.

The risk assessment requires the backend below. Without it, the page still opens but displays an API connection error. The startup command uses port 5173 strictly because it is an allowed backend origin. If the port is occupied, stop the other server or use the existing FundiFi server on that port.

## Enable risk assessments

Install Python 3.10+ and, from the repository root, set up the backend once:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

In a second terminal at the repository root, start the API each time:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Keep both terminals open. Check [http://localhost:8000/health](http://localhost:8000/health); `models_loaded` must be `true` for assessments. If the model files are missing, generate them once and restart the API:

```powershell
.\.venv\Scripts\python.exe backend\train_model.py
```

The supplied training process uses synthetic data; its results are not evidence of real-world credit performance. The UI's result is advisory, not a loan approval or identity verification. The wallet address is manually entered and its ownership is not verified.

### Troubleshooting

- If `npm` or `python` is not recognized, install the corresponding runtime and reopen the terminal.
- If the UI cannot reach the API, check that the API terminal is running, visit its health URL, and use **localhost:5173**, not `127.0.0.1:5173`: the backend permits specific origins.
- If the API reports models are not loaded, run the training command above, restart the API, and select **Refresh** in the UI.
- If port 8000 is occupied, stop the other service or configure the frontend API URL and backend origins as described in the [frontend guide](frontend/README.md).

For frontend configuration and checks, see the [frontend guide](frontend/README.md). For backend details, see the [backend guide](docs/backend/overview.md).
