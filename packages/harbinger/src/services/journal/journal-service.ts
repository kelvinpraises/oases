import type { Kysely } from "kysely";
import type { HarbingerDB } from "../../infrastructure/database/schema";
import { insertJournalEntry } from "../../infrastructure/database/schema";
import type {
  JournalEntry,
  JournalLevel,
  JournalEntryType,
} from "../../models/JournalEntry";
import type { JournalSubscriber } from "./types";

export class JournalService {
  private listeners: Set<JournalSubscriber> = new Set();

  constructor(private db: Kysely<HarbingerDB>) {}

  /**
   * Records an immutable thought into SQLite via Kysely and dispatches it to active listeners.
   * Enforces Forensic Immutability (Axiom 3.3).
   */
  public async recordThought(
    entry: Omit<JournalEntry, "id" | "timestamp"> & {
      id?: string;
      timestamp?: number;
    },
  ): Promise<JournalEntry> {
    const fullEntry: JournalEntry = {
      id: entry.id ?? `jrn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp ?? Date.now(),
      level: entry.level,
      type: entry.type,
      source: entry.source,
      thought: entry.thought,
      confidenceScore: entry.confidenceScore,
      metadata: entry.metadata,
    };

    // 1. Immutable SQLite Persistence via Kysely (Axiom 3.3)
    await insertJournalEntry(this.db, fullEntry);

    // 2. Dispatch to Active Listeners (WebSocket server, telemetry streams)
    for (const listener of this.listeners) {
      try {
        const result = listener(fullEntry);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch(() => {});
        }
      } catch {
        // Protect dispatch loop against listener failures
      }
    }

    return fullEntry;
  }

  /**
   * Retrieves recent thought history for WebSocket backfill snapshots and forensic auditing.
   */
  public async getRecentThoughts(
    limit = 50,
    level?: JournalLevel,
  ): Promise<JournalEntry[]> {
    let query = this.db.selectFrom("journal_entries").selectAll();
    if (level) {
      query = query.where("level", "=", level);
    }
    const rows = await query
      .orderBy("timestamp", "desc")
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level as JournalLevel,
      type: row.type as JournalEntryType,
      source: row.source,
      thought: row.thought,
      confidenceScore: row.confidence_score,
      metadata: row.metadata
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : undefined,
    }));
  }

  /**
   * Subscribes a listener callback to real-time thought records.
   * Returns an unsubscribe function.
   */
  public subscribe(listener: JournalSubscriber): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getListenerCount(): number {
    return this.listeners.size;
  }
}
