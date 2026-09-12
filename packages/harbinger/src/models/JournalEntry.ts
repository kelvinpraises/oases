export type JournalLevel = "INFO" | "ANOMALY" | "ALERT" | "RESOLUTION";

export type JournalEntryType =
  | "MARKET_METRIC_ANALYSIS"
  | "DEVIATION_ANALYSIS"
  | "CONTAGION_ANALYSIS"
  | "THRESHOLD_ANALYSIS"
  | "CLUSTER_SYNTHESIS"
  | "CADENCE_DECISION"
  | "RESOLUTION_VERDICT"
  | "YIELD_INJECTION"
  | "SYSTEM_LIFECYCLE";

export interface JournalEntry {
  id: string;
  timestamp: number;
  level: JournalLevel;
  type: JournalEntryType;
  source: string; // e.g. "detective_agent" | "reflex_loop" | "daemon"
  thought: string;
  confidenceScore: number; // 0.0 to 1.0
  metadata?: Record<string, unknown>;
}
