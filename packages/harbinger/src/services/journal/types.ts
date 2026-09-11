import type { JournalEntry, JournalLevel, JournalEntryType } from "../../models/JournalEntry";

export interface JournalQueryOptions {
  limit?: number;
  level?: JournalLevel;
  type?: JournalEntryType;
}

export type JournalSubscriber = (entry: JournalEntry) => Promise<void> | void;
