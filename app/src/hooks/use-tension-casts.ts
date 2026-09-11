import { useState, useEffect, useMemo } from 'react'
import type { TensionCast } from '@/types/tension-cast'
import { useWalletContext } from '@/providers/wallet-provider'
import { rawToUsdc, sharesToNumber } from '@oases/options'
import type { Hex } from 'viem'

export const PROTOCOL_TENSION_CASTS: TensionCast[] = [
  {
    id: 'tc-aave-crv-cascade',
    marketId: '0x0000000000000000000000000000000000000000000000000000000000000001',
    title: 'Aave CRV Debt Cascade Watch',
    description:
      'Multi-vault contagion cluster tracking correlated stress across Whale 0x7a, Aave v3 Core Reserve liquidity, and debt invariant stability.',
    status: 'ACTIVE',
    startBlock: 20000000,
    deadlineBlock: 20000300,
    currentBlock: 20000142,
    childVaults: [
      {
        id: 'vault-whale-hf-breach',
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000011',
        characterId: 'actor-whale-0x7a',
        characterName: 'Aave Whale 0x7a',
        classType: 'Actor',
        question: 'Will Whale 0x7a health factor breach 1.0 (Liquidation Trigger)?',
        metricTarget: 'healthFactor <= 1.00',
        status: 'STREAMING',
        seedPotUSDC: 20,
        totalStreamedUSDC: 1245.5,
        currentPriceP0: 0.1,
        yesPoolUSDC: 632.75,
        noPoolUSDC: 632.75,
        yesShares: 6327.5,
        noShares: 6327.5,
      },
      {
        id: 'vault-aave-reserve-drain',
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000012',
        characterId: 'place-aave-v3-core',
        characterName: 'Aave v3 Core Reserve Pool',
        classType: 'Place',
        question: 'Will Aave v3 Core USDC utilization breach 95.0%?',
        metricTarget: 'utilizationRate >= 0.95',
        status: 'STREAMING',
        seedPotUSDC: 20,
        totalStreamedUSDC: 890.0,
        currentPriceP0: 0.1,
        yesPoolUSDC: 455.0,
        noPoolUSDC: 455.0,
        yesShares: 4550.0,
        noShares: 4550.0,
      },
      {
        id: 'vault-whale-debt-breach',
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000013',
        characterId: 'bond-whale-debt',
        characterName: '0x7a CRV Debt Coupling',
        classType: 'Bond',
        question: 'Will 0x7a total USDC debt coupling breach $15.0M?',
        metricTarget: 'totalBorrowBalanceUSD >= 15000000',
        status: 'STREAMING',
        seedPotUSDC: 20,
        totalStreamedUSDC: 640.25,
        currentPriceP0: 0.1,
        yesPoolUSDC: 330.12,
        noPoolUSDC: 330.13,
        yesShares: 3301.2,
        noShares: 3301.3,
      },
    ],
  },
  {
    id: 'tc-compound-collateral-peg',
    marketId: '0x0000000000000000000000000000000000000000000000000000000000000002',
    title: 'Compound v3 Collateral Invariant Watch',
    description:
      'Coordinated invariant monitoring secondary market peg shifts and collateral liquidity velocity.',
    status: 'MONITORING',
    startBlock: 20000100,
    deadlineBlock: 20000500,
    currentBlock: 20000142,
    childVaults: [
      {
        id: 'vault-compound-weth-drain',
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000021',
        characterId: 'place-aave-v3-core',
        characterName: 'Compound v3 Market',
        classType: 'Place',
        question: 'Will WETH reserve drain exceed 15% delta in 50 blocks?',
        metricTarget: 'deltaReserve >= 0.15',
        status: 'LOCKED',
        seedPotUSDC: 20,
        totalStreamedUSDC: 420.0,
        currentPriceP0: 0.1,
        yesPoolUSDC: 220.0,
        noPoolUSDC: 220.0,
        yesShares: 2200.0,
        noShares: 2200.0,
      },
      {
        id: 'vault-liquidate-event',
        vaultId: '0x0000000000000000000000000000000000000000000000000000000000000022',
        characterId: 'act-flash-liquidation',
        characterName: 'Automated Liquidate Call',
        classType: 'Act',
        question: 'Will MEV liquidation execute before block deadline?',
        metricTarget: 'eventCount >= 1',
        status: 'LOCKED',
        seedPotUSDC: 20,
        totalStreamedUSDC: 150.0,
        currentPriceP0: 0.1,
        yesPoolUSDC: 85.0,
        noPoolUSDC: 85.0,
        yesShares: 850.0,
        noShares: 850.0,
      },
    ],
  },
]

export function useTensionCasts() {
  const [tensionCasts, setTensionCasts] = useState<TensionCast[]>(PROTOCOL_TENSION_CASTS)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const { reader } = useWalletContext()

  // Attempt to hydrate on-chain vault data if reader is available
  useEffect(() => {
    if (!reader) return

    let isMounted = true
    const hydrateFromChain = async () => {
      setIsLoading(true)
      try {
        const updated = await Promise.all(
          PROTOCOL_TENSION_CASTS.map(async (tc) => {
            const updatedVaults = await Promise.all(
              tc.childVaults.map(async (cv) => {
                if (!cv.vaultId) return cv
                try {
                  const vaultData = await reader.readVault(cv.vaultId as Hex)
                  if (vaultData && vaultData.exists) {
                    const yesPool = rawToUsdc(vaultData.yesPool)
                    const noPool = rawToUsdc(vaultData.noPool)
                    const yesShares = sharesToNumber(vaultData.yesShares)
                    const noShares = sharesToNumber(vaultData.noShares)
                    return {
                      ...cv,
                      yesPoolUSDC: yesPool,
                      noPoolUSDC: noPool,
                      yesShares,
                      noShares,
                      totalStreamedUSDC: yesPool + noPool,
                      resolvedOutcome: vaultData.resolvedAt > 0 ? vaultData.outcome : undefined,
                      status:
                        vaultData.resolvedAt > 0
                          ? ('RESOLVED' as const)
                          : cv.status,
                    }
                  }
                } catch {
                  // If vault query reverts or not yet deployed, fallback to defaults
                }
                return cv
              })
            )
            return { ...tc, childVaults: updatedVaults }
          })
        )

        if (isMounted) {
          setTensionCasts(updated)
          setIsLoading(false)
        }
      } catch (err) {
        console.warn('On-chain tension cast hydration skipped:', err)
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    hydrateFromChain()
    return () => {
      isMounted = false
    }
  }, [reader])

  return {
    tensionCasts,
    activeCount: tensionCasts.filter((tc) => tc.status === 'ACTIVE').length,
    isLoading,
  }
}

export function useTensionCast(id?: string) {
  const { tensionCasts, isLoading } = useTensionCasts()

  const tensionCast = useMemo(() => {
    if (!id) return undefined
    return tensionCasts.find((tc) => tc.id === id)
  }, [tensionCasts, id])

  return {
    tensionCast,
    isLoading,
  }
}
