import { expect } from 'chai'
import { assertLocalHardhat } from '../scripts/seed-local-demo.js'

const accounts = [
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
]

function provider(overrides = {}) {
  const responses = {
    eth_chainId: '0x7a69',
    web3_clientVersion: 'HardhatNetwork/3.18.0',
    hardhat_metadata: { chainId: 31337 },
    eth_accounts: accounts,
    ...overrides,
  }
  const calls = []
  return {
    calls,
    async send(method) { calls.push(method); return responses[method] },
  }
}

describe('local demo safety checks', () => {
  it('accepts a local unforked Hardhat node with default test accounts', async () => {
    await assertLocalHardhat(provider())
  })

  it('rejects another chain before any other RPC checks', async () => {
    const rpc = provider({ eth_chainId: '0x1' })
    try { await assertLocalHardhat(rpc); expect.fail('Expected rejection') }
    catch (error) { expect(error.message).to.include('chain ID 31337') }
    expect(rpc.calls).to.deep.equal(['eth_chainId'])
  })

  it('rejects non-Hardhat, forked, and non-default account configurations', async () => {
    for (const [overrides, message] of [
      [{ web3_clientVersion: 'OtherClient' }, 'not a Hardhat node'],
      [{ hardhat_metadata: { chainId: 31337, forkedNetwork: { chainId: 1 } } }, 'unforked'],
      [{ eth_accounts: [accounts[0]] }, 'default unlocked Hardhat test accounts'],
    ]) {
      try { await assertLocalHardhat(provider(overrides)); expect.fail('Expected rejection') }
      catch (error) { expect(error.message).to.include(message) }
    }
  })
})
