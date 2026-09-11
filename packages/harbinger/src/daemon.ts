import type { Kysely } from "kysely";
import { loadConfig, type HarbingerConfig } from "./config";
import {
  getDatabase,
  closeDatabase,
} from "./infrastructure/database/connection";
import {
  getActiveJobs,
  upsertJob,
  insertJournalEntry,
  type HarbingerDB,
} from "./infrastructure/database/schema";
import type { JournalEntry } from "./models/JournalEntry";

export interface DaemonState {
  isReady: boolean;
  config: HarbingerConfig;
  db: Kysely<HarbingerDB>;
  activeJobCount: number;
}

let activeDaemon: DaemonState | null = null;

export async function initHarbinger(
  configOverrides: Partial<HarbingerConfig> = {},
): Promise<DaemonState> {
  if (activeDaemon && activeDaemon.isReady) {
    return activeDaemon;
  }

  // 1. Validate Config
  const config = loadConfig(configOverrides);

  // 2. Initialize Database via Kysely
  const db = getDatabase(config.dbPath);

  // 3. Rehydrate State
  const activeJobs = await getActiveJobs(db);
  for (const job of activeJobs) {
    if (job.status === "running") {
      // Reset in-memory lock on restart
      job.status = "idle";
      job.updatedAt = Date.now();
      await upsertJob(db, job);
    }
  }

  // 4. Log Boot Thought
  const bootEntry: JournalEntry = {
    id: `jrn-${Date.now()}-boot`,
    timestamp: Date.now(),
    level: "INFO",
    type: "SYSTEM_LIFECYCLE",
    source: "daemon",
    thought: `Harbinger daemon initialized on chain ${config.chainId}. Rehydrated ${activeJobs.length} active monitoring jobs.`,
    confidenceScore: 1.0,
    metadata: {
      chainId: config.chainId,
      activeJobCount: activeJobs.length,
      dbPath: config.dbPath,
    },
  };
  await insertJournalEntry(db, bootEntry);

  activeDaemon = {
    isReady: true,
    config,
    db,
    activeJobCount: activeJobs.length,
  };

  return activeDaemon;
}

export async function shutdownHarbinger(): Promise<void> {
  if (!activeDaemon) return;

  const { db } = activeDaemon;

  const shutdownEntry: JournalEntry = {
    id: `jrn-${Date.now()}-shutdown`,
    timestamp: Date.now(),
    level: "INFO",
    type: "SYSTEM_LIFECYCLE",
    source: "daemon",
    thought:
      "Harbinger daemon shutting down cleanly. Releasing database locks.",
    confidenceScore: 1.0,
  };
  await insertJournalEntry(db, shutdownEntry);

  await closeDatabase();
  activeDaemon = null;
}

export function getDaemonState(): DaemonState | null {
  return activeDaemon;
}
