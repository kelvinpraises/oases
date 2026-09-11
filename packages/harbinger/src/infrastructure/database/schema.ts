import type { Kysely } from "kysely";
import type { Job } from "../../models/Job";
import type { JournalEntry } from "../../models/JournalEntry";

export interface ActiveJobTable {
  id: string;
  vault_id: string;
  cadence_ms: number;
  status: string; // "idle" | "running" | "paused" | "stopped"
  last_tick_block: string | null;
  consecutive_breaches: number;
  created_at: number;
  updated_at: number;
}

export interface JournalEntryTable {
  id: string;
  timestamp: number;
  level: string; // "INFO" | "ANOMALY" | "ALERT" | "RESOLUTION"
  type: string;
  source: string;
  thought: string;
  confidence_score: number;
  metadata: string | null; // JSON stringified
}

export interface HealthSnapshotTable {
  timestamp: number;
  active_jobs_count: number;
  block_height: string;
  status: string;
}

export interface HarbingerDB {
  active_jobs: ActiveJobTable;
  journal_entries: JournalEntryTable;
  health_snapshots: HealthSnapshotTable;
}

export async function insertJournalEntry(
  db: Kysely<HarbingerDB>,
  entry: JournalEntry,
): Promise<void> {
  await db
    .insertInto("journal_entries")
    .values({
      id: entry.id,
      timestamp: entry.timestamp,
      level: entry.level,
      type: entry.type,
      source: entry.source,
      thought: entry.thought,
      confidence_score: entry.confidenceScore,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    })
    .execute();
}

export async function getRecentJournalEntries(
  db: Kysely<HarbingerDB>,
  limit = 50,
): Promise<JournalEntry[]> {
  const rows = await db
    .selectFrom("journal_entries")
    .selectAll()
    .orderBy("timestamp", "desc")
    .limit(limit)
    .execute();

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    level: r.level as JournalEntry["level"],
    type: r.type as JournalEntry["type"],
    source: r.source,
    thought: r.thought,
    confidenceScore: r.confidence_score,
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
  }));
}

export async function upsertJob(
  db: Kysely<HarbingerDB>,
  job: Job,
): Promise<void> {
  await db
    .insertInto("active_jobs")
    .values({
      id: job.id,
      vault_id: job.vaultId,
      cadence_ms: job.cadenceMs,
      status: job.status,
      last_tick_block:
        job.lastTickBlock !== undefined ? String(job.lastTickBlock) : null,
      consecutive_breaches: job.consecutiveBreaches,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        cadence_ms: job.cadenceMs,
        status: job.status,
        last_tick_block:
          job.lastTickBlock !== undefined ? String(job.lastTickBlock) : null,
        consecutive_breaches: job.consecutiveBreaches,
        updated_at: job.updatedAt,
      }),
    )
    .execute();
}

export async function getActiveJobs(db: Kysely<HarbingerDB>): Promise<Job[]> {
  const rows = await db
    .selectFrom("active_jobs")
    .selectAll()
    .where("status", "!=", "stopped")
    .execute();

  return rows.map((r) => ({
    id: r.id,
    vaultId: r.vault_id,
    cadenceMs: r.cadence_ms,
    status: r.status as Job["status"],
    lastTickBlock: r.last_tick_block ? Number(r.last_tick_block) : undefined,
    consecutiveBreaches: r.consecutive_breaches,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function getJobById(
  db: Kysely<HarbingerDB>,
  id: string,
): Promise<Job | undefined> {
  const row = await db
    .selectFrom("active_jobs")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  if (!row) return undefined;

  return {
    id: row.id,
    vaultId: row.vault_id,
    cadenceMs: row.cadence_ms,
    status: row.status as Job["status"],
    lastTickBlock:
      row.last_tick_block ? Number(row.last_tick_block) : undefined,
    consecutiveBreaches: row.consecutive_breaches,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteJob(
  db: Kysely<HarbingerDB>,
  id: string,
): Promise<void> {
  await db.deleteFrom("active_jobs").where("id", "=", id).execute();
}

export async function recordHealthSnapshot(
  db: Kysely<HarbingerDB>,
  snapshot: {
    timestamp: number;
    activeJobsCount: number;
    blockHeight: number;
    status: string;
  },
): Promise<void> {
  await db
    .insertInto("health_snapshots")
    .values({
      timestamp: snapshot.timestamp,
      active_jobs_count: snapshot.activeJobsCount,
      block_height: String(snapshot.blockHeight),
      status: snapshot.status,
    })
    .execute();
}
