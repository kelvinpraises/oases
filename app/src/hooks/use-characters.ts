import { useState, useMemo } from 'react'
import type { ProtocolCharacter, PhysicalClass } from '@/types/character'

export const PROTOCOL_CHARACTERS: ProtocolCharacter[] = [
  {
    id: 'actor-whale-0x7a',
    name: 'Aave Whale 0x7a',
    classType: 'Actor',
    subClass: 'Whale',
    targetAddress: '0x7a16fF8270133F063aAb6C9977183D9e72835428',
    subgraphEndpoint: 'https://gateway.thegraph.com/api/subgraphs/id/aave-v3-standard',
    primaryMetric: 'healthFactor',
    currentMetricValue: '1.12',
    anomalyStatus: 'STRAIN',
    description:
      'High-leverage lending market account holding heavy volatile collateral against USDC borrow lines on Aave v3 Ethereum.',
    activeTensionCastIds: ['tc-aave-crv-cascade'],
  },
  {
    id: 'place-aave-v3-core',
    name: 'Aave v3 Core Reserve Pool',
    classType: 'Place',
    subClass: 'Bank',
    targetAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    subgraphEndpoint: 'https://gateway.thegraph.com/api/subgraphs/id/lending-standard',
    primaryMetric: 'availableLiquidityUSD',
    currentMetricValue: '$42,850,000',
    anomalyStatus: 'STIR',
    description:
      'Primary liquidity reservoir absorbing borrow stress and collateral redeployments.',
    activeTensionCastIds: ['tc-aave-crv-cascade'],
  },
  {
    id: 'bond-whale-debt',
    name: '0x7a CRV Debt Coupling',
    classType: 'Bond',
    subClass: 'Anchor',
    targetAddress: '0x7a-aave-crv-debt',
    subgraphEndpoint: 'https://gateway.thegraph.com/api/subgraphs/id/lending-standard',
    primaryMetric: 'totalBorrowBalanceUSD',
    currentMetricValue: '$14,280,000',
    anomalyStatus: 'STRAIN',
    description:
      'Relational debt invariant coupling Whale 0x7a CRV debt to Aave v3 USDC reserve liquidity.',
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
    const cleanId = id.toLowerCase().trim()
    return (
      PROTOCOL_CHARACTERS.find((c) => c.id === cleanId) ||
      PROTOCOL_CHARACTERS.find((c) => c.id.replace(/^(actor|place|bond|act)-/, '') === cleanId) ||
      PROTOCOL_CHARACTERS.find((c) => cleanId.replace(/^(actor|place|bond|act)-/, '') === c.id.replace(/^(actor|place|bond|act)-/, ''))
    )
  }, [id])

  return {
    character,
    isLoading: false,
  }
}
