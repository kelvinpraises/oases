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
import { mockUsdcAbi } from '@oases/contracts'

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

export const hederaTestnet: Chain = {
  id: 296,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet.hashio.io/api'] },
  },
  blockExplorers: {
    default: { name: 'HashScan', url: 'https://hashscan.io/testnet' },
  },
}

export const SUPPORTED_CHAINS = [anvilLocalhost, hederaTestnet]

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

  // Active chain definition
  const activeChain = useMemo(() => {
    if (state.chainId === 296) return hederaTestnet
    return anvilLocalhost
  }, [state.chainId])

  // Create public client for reads
  const publicClient = useMemo(() => {
    if (typeof window !== 'undefined' && window.ethereum) {
      return createPublicClient({
        chain: activeChain,
        transport: custom(window.ethereum),
      })
    }
    return createPublicClient({
      chain: activeChain,
      transport: http(activeChain.rpcUrls.default.http[0]),
    })
  }, [activeChain])

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
      const chain = chainId === 296 ? hederaTestnet : anvilLocalhost

      const walletClient = createWalletClient({
        account,
        chain,
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

  const switchNetwork = useCallback(async (targetChainId: number) => {
    if (typeof window === 'undefined' || !window.ethereum) return

    const hexChainId = `0x${targetChainId.toString(16)}`
    const targetChain = targetChainId === 296 ? hederaTestnet : anvilLocalhost

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      })
    } catch (switchError: any) {
      // Error 4902 indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: hexChainId,
                chainName: targetChain.name,
                rpcUrls: targetChain.rpcUrls.default.http,
                nativeCurrency: targetChain.nativeCurrency,
                blockExplorerUrls: targetChain.blockExplorers?.default?.url
                  ? [targetChain.blockExplorers.default.url]
                  : undefined,
              },
            ],
          })
        } catch (addError) {
          console.error('Failed to add chain to wallet:', addError)
        }
      } else {
        console.error('Failed to switch network:', switchError)
      }
    }
  }, [])

  // 1-Click Faucet execution: Mints $100 Mock USDC directly on-chain
  const claimMockUsdc = useCallback(
    async (amount: bigint = 100_000_000n) => {
      if (!state.walletClient || !state.address || !reader) {
        throw new Error('Wallet not connected')
      }

      const mockUsdcAddress = reader.addresses.mockUsdc
      const hash = await state.walletClient.writeContract({
        address: mockUsdcAddress,
        abi: mockUsdcAbi,
        functionName: 'mint',
        args: [state.address, amount],
        chain: activeChain,
        account: state.address,
      } as any)

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash })
      }

      await refreshUserData(state.address, reader)
      return hash
    },
    [state.walletClient, state.address, reader, activeChain, publicClient, refreshUserData]
  )

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
      const nextChainId = parseInt(hexChainId, 16)
      setState((prev) => ({ ...prev, chainId: nextChainId }))
      if (state.address && reader) {
        refreshUserData(state.address, reader)
      }
    }

    window.ethereum.on?.('accountsChanged', handleAccountsChanged)
    window.ethereum.on?.('chainChanged', handleChainChanged)

    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener?.('chainChanged', handleChainChanged)
    }
  }, [disconnect, reader, refreshUserData, state.address])

  return {
    ...state,
    activeChain,
    isHedera: state.chainId === 296,
    connect,
    disconnect,
    switchNetwork,
    claimMockUsdc,
    refreshUserData: () => {
      if (state.address && reader) {
        refreshUserData(state.address, reader)
      }
    },
  }
}
