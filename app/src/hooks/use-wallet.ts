import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem'
import {
  createOptionsReader,
  createOptionsWriter,
  type OptionsReader,
  type OptionsWriter,
  rawToUsdc,
} from '@oases/options'

declare global {
  interface Window {
    ethereum?: any
  }
}

export const anvilLocalhost: Chain = {
  id: 31337,
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
}

export interface WalletState {
  isConnected: boolean
  isConnecting: boolean
  address: Address | null
  chainId: number | null
  usdcBalance: number
  userTokenIds: readonly bigint[]
  error: string | null
  publicClient: PublicClient | null
  walletClient: WalletClient | null
  reader: OptionsReader | null
  writer: OptionsWriter | null
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    isConnecting: false,
    address: null,
    chainId: null,
    usdcBalance: 0,
    userTokenIds: [],
    error: null,
    publicClient: null,
    walletClient: null,
    reader: null,
    writer: null,
  })

  // Create public client for reads
  const publicClient = useMemo(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      return createPublicClient({
        chain: anvilLocalhost,
        transport: custom(window.ethereum),
      })
    }
    return createPublicClient({
      chain: anvilLocalhost,
      transport: http('http://127.0.0.1:8545'),
    })
  }, [])

  // Create options reader
  const reader = useMemo(() => {
    try {
      return createOptionsReader({ publicClient })
    } catch {
      return null
    }
  }, [publicClient])

  // Refresh balances & held NFT tokens
  const refreshUserData = useCallback(
    async (account: Address, optReader: OptionsReader) => {
      try {
        const [rawBal, tokens] = await Promise.all([
          optReader.readUsdcBalance(account).catch(() => 0n),
          optReader.listOwnerTokens(account).catch(() => [] as readonly bigint[]),
        ])
        const bal = rawToUsdc(rawBal)
        setState((prev) => ({
          ...prev,
          usdcBalance: bal,
          userTokenIds: tokens,
        }))
      } catch (err) {
        console.warn('Failed to refresh user data:', err)
      }
    },
    []
  )

  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setState((prev) => ({
        ...prev,
        error: 'No browser wallet detected. Please install MetaMask or Rabby.',
      }))
      return
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }))

    try {
      const accounts: string[] = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts selected')
      }

      const account = accounts[0] as Address
      const hexChainId: string = await window.ethereum.request({
        method: 'eth_chainId',
      })
      const chainId = parseInt(hexChainId, 16)

      const walletClient = createWalletClient({
        account,
        chain: anvilLocalhost,
        transport: custom(window.ethereum),
      })

      let writer: OptionsWriter | null = null
      try {
        writer = createOptionsWriter({ walletClient, publicClient })
      } catch (err) {
        console.warn('OptionsWriter initialization deferred:', err)
      }

      setState({
        isConnected: true,
        isConnecting: false,
        address: account,
        chainId,
        usdcBalance: 0,
        userTokenIds: [],
        error: null,
        publicClient,
        walletClient,
        reader,
        writer,
      })

      if (reader) {
        refreshUserData(account, reader)
      }
    } catch (err: any) {
      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: err?.message || 'Failed to connect wallet',
      }))
    }
  }, [publicClient, reader, refreshUserData])

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      isConnecting: false,
      address: null,
      chainId: null,
      usdcBalance: 0,
      userTokenIds: [],
      error: null,
      publicClient,
      walletClient: null,
      reader,
      writer: null,
    })
  }, [publicClient, reader])

  // Setup event listeners for account/chain changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect()
      } else {
        const nextAccount = accounts[0] as Address
        setState((prev) => ({ ...prev, address: nextAccount }))
        if (reader) {
          refreshUserData(nextAccount, reader)
        }
      }
    }

    const handleChainChanged = (hexChainId: string) => {
      setState((prev) => ({ ...prev, chainId: parseInt(hexChainId, 16) }))
    }

    window.ethereum.on?.('accountsChanged', handleAccountsChanged)
    window.ethereum.on?.('chainChanged', handleChainChanged)

    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [disconnect, reader, refreshUserData])

  return {
    ...state,
    connect,
    disconnect,
    refreshUserData: () => {
      if (state.address && reader) {
        refreshUserData(state.address, reader)
      }
    },
  }
}
