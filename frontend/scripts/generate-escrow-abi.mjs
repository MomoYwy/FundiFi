import { readFile, writeFile } from 'node:fs/promises'

const artifact = JSON.parse(await readFile(new URL('../../artifacts/contracts/P2PLendingEscrow.sol/P2PLendingEscrow.json', import.meta.url), 'utf8'))
await writeFile(new URL('../src/web3/escrow-abi.json', import.meta.url), `${JSON.stringify(artifact.abi, null, 2)}\n`)
