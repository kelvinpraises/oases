export type DeviationGrade = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5'

export interface TelemetrySignal {
  entityId: string
  metric: string
  value: number | string
  blockNumber: number
  timestamp: number
  zScore?: number
  grade?: DeviationGrade
}
