import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { HarbingerDB } from "./schema";

let activeDb: Kysely<HarbingerDB> | null = null;
let rawSqlite: Database.Database | null = null;

export function getDatabase(dbPath?: string): Kysely<HarbingerDB> {
  if (activeDb) return activeDb;

  const targetPath =
    dbPath ||
    process.env.HARBINGER_DB_PATH ||
    resolve(process.cwd(), ".data/harbinger.db");

  if (targetPath !== ":memory:") {
    mkdirSync(dirname(targetPath), { recursive: true });
  }

  rawSqlite = new Database(targetPath);
  rawSqlite.pragma("journal_mode = WAL");
  rawSqlite.pragma("synchronous = NORMAL");
  rawSqlite.pragma("foreign_keys = ON");

  initSchema(rawSqlite);

  activeDb = new Kysely<HarbingerDB>({
    dialect: new SqliteDialect({ database: rawSqlite }),
  });

  return activeDb;
}

export async function closeDatabase(): Promise<void> {
  if (activeDb) {
    await activeDb.destroy();
    activeDb = null;
  }
  if (rawSqlite) {
    try {
      if (rawSqlite.open) {
        rawSqlite.pragma("wal_checkpoint(TRUNCATE)");
      }
    } catch {
      // Safe catch for in-memory or already closed databases
    }
    rawSqlite.close();
    rawSqlite = null;
  }
}

function initSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      level TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      thought TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS active_jobs (
      id TEXT PRIMARY KEY,
      vault_id TEXT NOT NULL,
      cadence_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      last_tick_block TEXT,
      consecutive_breaches INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS health_snapshots (
      timestamp INTEGER PRIMARY KEY,
      active_jobs_count INTEGER NOT NULL,
      block_height TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_hcs_pitches (
      payer_tx_id TEXT PRIMARY KEY,
      consensus_timestamp TEXT NOT NULL,
      processed_at INTEGER NOT NULL
    );
  `);
}
