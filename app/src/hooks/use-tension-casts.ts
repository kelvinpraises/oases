import { useState, useMemo } from 'react'
import type { TensionCast } from '@/types/tension-cast'

const PROTOCOL_TENSION_CASTS: TensionCast[] = [
  {
    id: 'tc-aave-crv-cascade',
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
        characterId: 'actor-whale-0x7a',
        characterName: 'Aave Whale 0x7a',
        classType: 'Actor',
        question: 'Will Whale 0x7a health factor breach 1.0 (Liquidation Trigger)?',
        metricTarget: 'healthFactor <= 1.00',
        status: 'STREAMING',
        seedPotUSDC: 20,
        totalStreamedUSDC: 1245.5,
        currentPriceP0: 0.5,
      },
      {
        id: 'vault-aave-reserve-drain',
        characterId: 'place-aave-v3-core',
        characterName: 'Aave v3 Core Reserve Pool',
        classType: 'Place',
        question: 'Will Aave v3 Core USDC utilization breach 95.0%?',
        metricTarget: 'utilizationRate >= 0.95',
        status: 'STREAMING',
        seedPotUSDC: 20,
        totalStreamedUSDC: 890.0,
        currentPriceP0: 0.5,
      },
      {
        id: 'vault-whale-debt-breach',
        characterId: 'bond-whale-debt',
        characterName: '0x7a USDC Debt Coupling',
        classType: 'Bond',
        question: 'Will 0x7a total USDC debt coupling breach $15.0M?',
        metricTarget: 'totalDebtUSD >= 15000000',
        status: 'STREAMING',
        seedPotUSDC: 20,
        totalStreamedUSDC: 640.25,
        currentPriceP0: 0.5,
      },
    ],
  },
  {
    id: 'tc-compound-collateral-peg',
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
        characterId: 'place-aave-v3-core',
        characterName: 'Compound v3 Market',
        classType: 'Place',
        question: 'Will WETH reserve drain exceed 15% delta in 50 blocks?',
        metricTarget: 'deltaReserve >= 0.15',
        status: 'LOCKED',
        seedPotUSDC: 20,
        totalStreamedUSDC: 420.0,
        currentPriceP0: 0.5,
      },
      {
        id: 'vault-liquidate-event',
        characterId: 'act-flash-liquidation',
        characterName: 'Automated Liquidate Call',
        classType: 'Act',
        question: 'Will MEV liquidation execute before block deadline?',
        metricTarget: 'eventCount >= 1',
        status: 'LOCKED',
        seedPotUSDC: 20,
        totalStreamedUSDC: 150.0,
        currentPriceP0: 0.5,
      },
    ],
  },
]

export function useTensionCasts() {
  const [tensionCasts] = useState<TensionCast[]>(PROTOCOL_TENSION_CASTS)

  return {
    tensionCasts,
    activeCount: tensionCasts.filter((tc) => tc.status === 'ACTIVE').length,
    isLoading: false,
  }
}

export function useTensionCast(id?: string) {
  const tensionCast = useMemo(() => {
    if (!id) return undefined
    return PROTOCOL_TENSION_CASTS.find((tc) => tc.id === id)
  }, [id])

  return {
    tensionCast,
    isLoading: false,
  }
}
