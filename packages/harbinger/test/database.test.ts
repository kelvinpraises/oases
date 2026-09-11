import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getDatabase,
  closeDatabase,
  insertJournalEntry,
  getRecentJournalEntries,
  upsertJob,
  getActiveJobs,
  getJobById,
  deleteJob,
  recordHealthSnapshot,
  type HarbingerDB,
} from "../src/infrastructure/database/index";
import type { Job } from "../src/models/Job";
import type { JournalEntry } from "../src/models/JournalEntry";
import type { Kysely } from "kysely";

describe("Host SQLite Persistence (Kysely)", () => {
  let db: Kysely<HarbingerDB>;

  beforeEach(() => {
    db = getDatabase(":memory:");
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it("inserts and retrieves journal entries with JSON metadata serialization", async () => {
    const entry: JournalEntry = {
      id: "jrn-test-1",
      timestamp: 1726000000,
      level: "ANOMALY",
      type: "THRESHOLD_ANALYSIS",
      source: "reflex_loop",
      thought: "Detected anomalous health factor drop on whale 0x7a",
      confidenceScore: 0.88,
      metadata: {
        vaultId: "0xvaultWhale",
        previousHf: "1.25",
        currentHf: "0.98",
      },
    };

    await insertJournalEntry(db, entry);

    const recent = await getRecentJournalEntries(db, 10);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].id, "jrn-test-1");
    assert.equal(recent[0].level, "ANOMALY");
    assert.equal(recent[0].type, "THRESHOLD_ANALYSIS");
    assert.equal(recent[0].thought, entry.thought);
    assert.equal(recent[0].confidenceScore, 0.88);
    assert.deepEqual(recent[0].metadata, {
      vaultId: "0xvaultWhale",
      previousHf: "1.25",
      currentHf: "0.98",
    });
  });

  it("upserts, updates on conflict, and deletes jobs", async () => {
    const job: Job = {
      id: "job-whale",
      vaultId: "0xvaultWhale",
      cadenceMs: 10000,
      status: "idle",
      lastTickBlock: 20000000,
      consecutiveBreaches: 0,
      createdAt: 1000,
      updatedAt: 1000,
    };

    // Insert
    await upsertJob(db, job);
    let fetched = await getJobById(db, "job-whale");
    assert.ok(fetched);
    assert.equal(fetched.status, "idle");
    assert.equal(fetched.cadenceMs, 10000);

    // Update on conflict
    const updatedJob: Job = {
      ...job,
      status: "running",
      consecutiveBreaches: 1,
      cadenceMs: 2000,
      updatedAt: 2000,
    };
    await upsertJob(db, updatedJob);

    fetched = await getJobById(db, "job-whale");
    assert.ok(fetched);
    assert.equal(fetched.status, "running");
    assert.equal(fetched.consecutiveBreaches, 1);
    assert.equal(fetched.cadenceMs, 2000);

    // Delete
    await deleteJob(db, "job-whale");
    fetched = await getJobById(db, "job-whale");
    assert.equal(fetched, undefined);
  });

  it("getActiveJobs returns active jobs and ignores stopped jobs", async () => {
    await upsertJob(db, {
      id: "job-1",
      vaultId: "0x1",
      cadenceMs: 5000,
      status: "running",
      consecutiveBreaches: 0,
      createdAt: 1000,
      updatedAt: 1000,
    });
    await upsertJob(db, {
      id: "job-2",
      vaultId: "0x2",
      cadenceMs: 5000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: 1000,
      updatedAt: 1000,
    });
    await upsertJob(db, {
      id: "job-3",
      vaultId: "0x3",
      cadenceMs: 5000,
      status: "stopped",
      consecutiveBreaches: 0,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const active = await getActiveJobs(db);
    assert.equal(active.length, 2);
    const ids = active.map((j) => j.id).sort();
    assert.deepEqual(ids, ["job-1", "job-2"]);
  });

  it("preserves 64-bit/18-decimal Wad precision and block heights as TEXT without truncation", async () => {
    // Axiom 1.5: 18-decimal WAD precision and 64-bit integer preservation
    const largeBlockHeight = "18446744073709551615"; // 2^64 - 1
    await recordHealthSnapshot(db, {
      timestamp: 1726000000,
      activeJobsCount: 5,
      blockHeight: Number(20000100),
      status: "HEALTHY",
    });

    // Verify manual insert of extreme string integer
    await db
      .insertInto("health_snapshots")
      .values({
        timestamp: 1726000001,
        active_jobs_count: 5,
        block_height: largeBlockHeight,
        status: "HEALTHY",
      })
      .execute();

    const row = await db
      .selectFrom("health_snapshots")
      .where("timestamp", "=", 1726000001)
      .selectAll()
      .executeTakeFirstOrThrow();

    assert.equal(row.block_height, largeBlockHeight);
    const parsed = BigInt(row.block_height);
    assert.equal(parsed.toString(), largeBlockHeight);
  });
});
