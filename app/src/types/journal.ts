export type JournalLevel = 'INFO' | 'ANOMALY' | 'ALERT' | 'RESOLUTION'

export type JournalEntryType =
  | 'MARKET_METRIC_ANALYSIS'
  | 'DEVIATION_ANALYSIS'
  | 'CONTAGION_ANALYSIS'
  | 'THRESHOLD_ANALYSIS'
  | 'CLUSTER_SYNTHESIS'
  | 'CADENCE_DECISION'
  | 'RESOLUTION_VERDICT'
  | 'SYSTEM_LIFECYCLE'

export interface JournalEntry {
  id: string
  timestamp: number
  level: JournalLevel
  type: JournalEntryType
  source: string
  thought: string
  confidenceScore: number // 0.0 to 1.0
  metricValue?: string | number
  blockNumber?: number
  metadata?: Record<string, unknown>
}

export type StreamMessageType = 'INIT_BACKFILL' | 'JOURNAL_ENTRY' | 'HEALTH_PING'

export interface StreamMessage<T = unknown> {
  type: StreamMessageType
  timestamp: number
  data: T
}

export interface InitBackfillPayload {
  thoughts: JournalEntry[]
  totalCount: number
}
