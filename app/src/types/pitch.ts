export type PitchStatus = 'SUBMITTED' | 'VERIFIED' | 'REJECTED'

export interface AnomalyPitch {
  id: string
  characterId: string
  characterName: string
  submitter: string
  thesis: string
  metricKey: string
  evaluationTimebox: number
  totalFeeUSDC: number
  potYieldUSDC: number
  gasReserveUSDC: number
  timestamp: number
  status: PitchStatus
  txHash?: string
}

export interface PitchTemplate {
  id: string
  title: string
  characterId: string
  characterName: string
  thesis: string
  metricKey: string
  evaluationTimebox: number
}

export const ANOMALY_TEMPLATES: PitchTemplate[] = [
  {
    id: 'tpl-1',
    title: 'Whale 0x7a Health Degradation',
    characterId: 'whale-0x7a',
    characterName: 'Whale 0x7a',
    thesis: 'Whale 0x7a health factor degrades below 1.05 during collateral liquidation cascade',
    metricKey: 'healthFactor',
    evaluationTimebox: 50,
  },
  {
    id: 'tpl-2',
    title: 'Aave v3 Core Reserve Depletion',
    characterId: 'aave-core',
    characterName: 'Aave v3 Core Pool',
    thesis: 'Sudden borrowing shock drains available reserve liquidity below $5,000,000 threshold',
    metricKey: 'availableLiquidityUSD',
    evaluationTimebox: 100,
  },
  {
    id: 'tpl-3',
    title: '0x7a Debt Coupling Contagion',
    characterId: 'whale-0x7a',
    characterName: 'Whale 0x7a',
    thesis: 'Collateral liquidation trigger transmits bad-debt contagion to secondary lending markets',
    metricKey: 'contagionDebtRatio',
    evaluationTimebox: 75,
  },
]
