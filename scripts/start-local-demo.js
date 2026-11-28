import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(import.meta.dirname, '..')
process.chdir(root)
const hardhat = resolve(root, 'node_modules', 'hardhat', 'dist', 'src', 'cli.js')
const vite = resolve(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js')
const python = process.platform === 'win32'
  ? resolve(root, '.venv', 'Scripts', 'python.exe')
  : resolve(root, '.venv', 'bin', 'python')
const services = new Set()
let stopping = false
let failure

function stop() {
  if (stopping) return
  stopping = true
  for (const child of services) child.kill()
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stop(); process.exitCode = 0 })
}

function start(name, executable, args, env = process.env, cwd = root) {
  const child = spawn(executable, args, { cwd, env, stdio: 'inherit' })
  services.add(child)
  child.on('error', error => {
    if (!stopping) { failure = new Error(`${name} could not start: ${error.message}`); stop() }
  })
  child.on('exit', (code, signal) => {
    services.delete(child)
    if (!stopping) {
      failure = new Error(`${name} exited unexpectedly (${signal || code}).`)
      console.error(failure.message)
      process.exitCode = 1
      stop()
    }
  })
  return child
}

function checkStopped() {
  if (failure) throw failure
  if (stopping) throw new Error('Startup interrupted.')
}

async function assertFree(port) {
  await new Promise((resolvePromise, reject) => {
    const server = createServer()
    server.once('error', () => reject(new Error(`Port ${port} is unavailable. Stop the service using it before starting the demo.`)))
    server.listen(port, '127.0.0.1', () => server.close(resolvePromise))
  })
}

async function compile() {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [hardhat, 'compile'], { cwd: root, stdio: 'inherit' })
    services.add(child)
    child.once('error', reject)
    child.once('exit', code => {
      services.delete(child)
      if (code === 0) resolvePromise()
      else reject(new Error('Hardhat compilation failed.'))
    })
  })
}

async function waitFor(name, url, options = {}) {
  for (let attempt = 0; attempt < 120; attempt++) {
    checkStopped()
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(1000) })
      if (response.ok) return response
    } catch { /* The service may still be starting. */ }
    await delay(500)
  }
  throw new Error(`${name} did not become ready at ${url}.`)
}

async function main() {
  for (const [file, hint] of [
    [hardhat, 'Run npm ci.'],
    [vite, 'Run npm ci --prefix frontend.'],
    [python, 'Create .venv and install requirements.txt; see README.md.'],
  ]) {
    if (!existsSync(file)) throw new Error(`Missing ${file}. ${hint}`)
  }
  const { JsonRpcProvider } = await import('ethers')
  const { seed } = await import('./seed-local-demo.js')
  for (const port of [18545, 8000, 5173]) await assertFree(port)
  console.log('Compiling contracts...')
  await compile()
  checkStopped()
  start('Hardhat', process.execPath, [hardhat, 'node', '--hostname', '127.0.0.1', '--port', '18545'])
  await waitFor('Hardhat', 'http://127.0.0.1:18545', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
  })
  checkStopped()
  const provider = new JsonRpcProvider('http://127.0.0.1:18545', undefined, { cacheTimeout: -1 })
  let address
  try { address = await seed(provider) } finally { provider.destroy() }
  checkStopped()
  start('API', python, ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000'], {
    ...process.env, PYTHONDONTWRITEBYTECODE: '1',
  })
  const health = await (await waitFor('API', 'http://127.0.0.1:8000/health')).json()
  if (health.models_loaded !== true) throw new Error('API models are not loaded. See README.md for model setup.')
  start('Vite', process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    ...process.env, VITE_ESCROW_ADDRESS: address, VITE_CHAIN_ID: '31337',
    VITE_API_BASE_URL: 'http://localhost:8000', VITE_EXPLORER_URL: '',
  }, resolve(root, 'frontend'))
  await waitFor('Vite', 'http://127.0.0.1:5173')
  checkStopped()
  console.log(`\nDemo ready: http://localhost:5173\nEscrow: ${address}\nMetaMask RPC: http://127.0.0.1:18545, chain ID: 31337\nPress Ctrl+C to stop. Local chain data is temporary.`)
}

main().catch(error => {
  if (!stopping || failure) {
    console.error(`Local demo failed: ${error.message}`)
    process.exitCode = 1
  }
  stop()
})
