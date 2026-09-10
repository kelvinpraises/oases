import { useState, useCallback } from 'react'

export interface WalletState {
  isConnected: boolean
  address: string | null
  chainId: number | null
  usdcBalance: number
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    address: null,
    chainId: 296, // Hedera Testnet
    usdcBalance: 500.0,
  })

  const connect = useCallback(async () => {
    // Staged for Flow 2 full EVM RPC / HashPack integration
    setWallet({
      isConnected: true,
      address: '0x2b89A083d1FaC1aF1b3B43dC52B5817c1C128e08',
      chainId: 296,
      usdcBalance: 500.0,
    })
  }, [])

  const disconnect = useCallback(() => {
    setWallet({
      isConnected: false,
      address: null,
      chainId: null,
      usdcBalance: 0,
    })
  }, [])

  return {
    ...wallet,
    connect,
    disconnect,
  }
}
