# Local UI business-logic test template

Use this procedure for a disposable local demonstration. Adapt the scenarios to the requested behavior rather than claiming the whole system is verified.

1. **Define the scope.** Read the applicable project rules, existing implementation, seed data, and browser tests. Choose specific inputs, expected UI behavior, and authoritative API or contract outcomes. Record what is simulated or manual.
2. **Ask when needed.** Clarify which scenarios or expected behavior matter when the scope or rules have multiple reasonable interpretations. Ask before using real accounts, external networks, real funds, destructive operations, or sensitive data; an address alone is not authorization to sign. Use only disposable test accounts unless explicitly authorized otherwise.
3. **Prepare an isolated environment.** Check the working tree, dependencies, and ports; never stop an unknown service. Start the local demo described in the root README, verify the API health and loaded models, frontend availability, chain identity, and deployed contract. Record the address and ensure seed state matches the chosen tests.
4. **Exercise the UI.** Use the existing Playwright local-wallet bridge and interact with actual UI controls. Include successful and rejected cases, role and state boundaries, and loading/error behavior where relevant. Await the specific UI result and assert it before capturing a clearly named screenshot. Avoid sensitive values in screenshots.
5. **Verify the source of truth.** Compare UI values with the API response or read the contract state and events; for rejected on-chain actions, check contract rejection independently when applicable. Explicitly identify manual oracle steps and distinguish an advisory model score from an approval or proof of fraud. Record timings as individual observations, not a latency guarantee.
6. **Preserve evidence.** Save relevant screenshots in the session's persistent files and attach them to the report. If screenshots are unavailable, say so. Report each scenario, expected versus actual outcome, and any failures without implying that simulated-wallet tests cover real MetaMask prompts or public networks.
7. **Finish safely.** Verify test results and cleanup, stop only processes started for the test, and confirm their ports are released. Preserve existing workspace changes. State whether local chain state was discarded and list meaningful gaps or blockers; do not claim untested functionality works.

## Result format

- **Outcome:** pass, fail, or blocked for each scenario, with the observed values or state.
- **Evidence:** screenshots and, when relevant, matching API or on-chain results.
- **Limitations:** simulated versus real wallet, manual steps, synthetic data, untested paths, and cleanup.
