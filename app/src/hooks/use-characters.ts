import { useState, useMemo } from 'react'
import type { ProtocolCharacter, PhysicalClass } from '@/types/character'

const PROTOCOL_CHARACTERS: ProtocolCharacter[] = [
  {
    id: 'actor-whale-0x7a',
    name: 'Aave Whale 0x7a',
    classType: 'Actor',
    subClass: 'Whale',
    targetAddress: '0x7a16ff8270133f063aab6c9977183d9e72835428',
    subgraphEndpoint: 'https://gateway.thegraph.com/api/subgraphs/id/aave-v3-standard',
    primaryMetric: 'healthFactor',
    currentMetricValue: '1.12',
    anomalyStatus: 'STRAIN',
    description:
      'High-leverage lending market account holding heavy volatile collateral against USDC borrow lines.',
    activeTensionCastIds: ['tc-aave-crv-cascade'],
  },
  {
    id: 'place-aave-v3-core',
    name: 'Aave v3 Core Reserve Pool',
    classType: 'Place',
    subClass: 'Bank',
    targetAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    subgraphEndpoint: 'https://gateway.thegraph.com/api/subgraphs/id/lending-standard',
    primaryMetric: 'utilizationRate',
    currentMetricValue: '84.5%',
    anomalyStatus: 'STIR',
    description:
      'Primary liquidity reservoir absorbing borrow stress and collateral redeployments.',
    activeTensionCastIds: ['tc-aave-crv-cascade'],
  },
  {
    id: 'bond-whale-debt',
    name: '0x7a USDC Debt Coupling',
    classType: 'Bond',
    subClass: 'Anchor',
    targetAddress: '0x7a16ff8270133f063aab6c9977183d9e72835428',
    subgraphEndpoint: 'https://gateway.thegraph.com/api/subgraphs/id/lending-standard',
    primaryMetric: 'totalDebtUSD',
    currentMetricValue: '$14,280,000',
    anomalyStatus: 'STRAIN',
    description:
      'Relational debt invariant coupling Whale 0x7a debt to Aave v3 USDC reserve liquidity.',
    activeTensionCastIds: ['tc-aave-crv-cascade'],
  },
  {
    id: 'act-flash-liquidation',
    name: 'Flash Liquidation Cascade',
    classType: 'Act',
    subClass: 'Avalanche',
    targetAddress: '0x6543210987654321098765432109876543210987',
    subgraphEndpoint: 'https://gateway.thegraph.com/api/subgraphs/id/liquidation-standard',
    primaryMetric: 'cascadeVelocity',
    currentMetricValue: '3 blocks',
    anomalyStatus: 'CALM',
    description:
      'Finite liquidation spiral sequence triggered if Actor health factor breaches 1.0 threshold.',
    activeTensionCastIds: ['tc-aave-crv-cascade'],
  },
]

export function useCharacters(selectedClass: PhysicalClass | 'All' = 'All') {
  const [characters] = useState<ProtocolCharacter[]>(PROTOCOL_CHARACTERS)

  const filteredCharacters = useMemo(() => {
    if (selectedClass === 'All') return characters
    return characters.filter((c) => c.classType === selectedClass)
  }, [characters, selectedClass])

  return {
    characters: filteredCharacters,
    allCharacters: characters,
    totalCount: characters.length,
    isLoading: false,
  }
}

export function useCharacter(id?: string) {
  const character = useMemo(() => {
    if (!id) return undefined
    return PROTOCOL_CHARACTERS.find((c) => c.id === id)
  }, [id])

  return {
    character,
    isLoading: false,
  }
}
