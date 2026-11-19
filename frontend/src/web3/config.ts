import { getAddress, isAddress, ZeroAddress } from 'ethers'

export function getConfig() {
  const address = import.meta.env.VITE_ESCROW_ADDRESS?.trim() || ''
  const chainText = import.meta.env.VITE_CHAIN_ID?.trim() || ''
  if (!isAddress(address) || address.toLowerCase() === ZeroAddress || !/^[1-9]\d*$/.test(chainText)) {
    throw new Error('Configure VITE_ESCROW_ADDRESS and VITE_CHAIN_ID in frontend/.env.')
  }
  const explorer = import.meta.env.VITE_EXPLORER_URL?.trim().replace(/\/+$/, '') || ''
  if (explorer) {
    const url = new URL(explorer)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid explorer URL.')
  }
  return { address: getAddress(address), chainId: BigInt(chainText), explorer }
}
