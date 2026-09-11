import type { JournalEntry } from "../../models/JournalEntry";

export type StreamMessageType = "INIT_BACKFILL" | "JOURNAL_ENTRY" | "HEALTH_PING";

export interface StreamMessage<T = unknown> {
  type: StreamMessageType;
  timestamp: number;
  data: T;
}

export interface InitBackfillPayload {
  thoughts: JournalEntry[];
  totalCount: number;
}

export function formatBroadcastMessage<T>(
  type: StreamMessageType,
  data: T,
): string {
  const envelope: StreamMessage<T> = {
    type,
    timestamp: Date.now(),
    data,
  };
  return JSON.stringify(envelope);
}
