import type { PhysicalClass } from './character'

export type CastStatus = 'ACTIVE' | 'MONITORING' | 'RESOLVED' | 'ABORTED'

export interface ChildVault {
  id: string
  characterId: string
  characterName: string
  classType: PhysicalClass
  question: string
  metricTarget: string
  status: 'STREAMING' | 'LOCKED' | 'RESOLVED'
  seedPotUSDC: number
  totalStreamedUSDC: number
  currentPriceP0: number
}

export interface TensionCast {
  id: string
  title: string
  description: string
  status: CastStatus
  startBlock: number
  deadlineBlock: number
  currentBlock?: number
  childVaults: ChildVault[]
}
