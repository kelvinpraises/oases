export type ResolutionDecision = 'RESOLVED_YES' | 'RESOLVED_NO' | 'REFUNDED'

export interface PrecedenceProof {
  breachBlock: number
  startBlock: number
  deadlineBlock: number
  abortTimestamp: number | null
  withinWindow: boolean
  notAborted: boolean
  consecutiveBreachBlocks: number
  requiredDebounce: number
  debounceVerified: boolean
  valid: boolean
  decision: ResolutionDecision
  reason: string
}

export interface BlockSnapshot {
  blockNumber: number
  inputs: Record<string, unknown>
  intermediate: Record<string, unknown>
  trigger: boolean
}

export interface SolverNode {
  type: 'expr' | 'call' | 'branch' | 'loop'
  id: string
  formula?: string
  output?: string
  toolHash?: string
  inputs?: Record<string, string>
  params?: Record<string, unknown>
}

export interface SolverManifest {
  version: string
  query?: string
  timeBounds?: {
    startBlock: number
    deadlineBlock: number
  }
  globals: Record<string, string>
  tree: SolverNode[]
  resolution: {
    triggerVariable: string
    debounceBlocks?: number
  }
}

export interface ReplayTicket {
  vaultId: string
  decision: ResolutionDecision
  manifest: SolverManifest
  precedenceProof: PrecedenceProof
  blockSnapshots: BlockSnapshot[]
  queryTemplate: string
  timestamp: number
}
