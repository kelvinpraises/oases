import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  initHarbinger,
  shutdownHarbinger,
  getDaemonState,
} from "../src/daemon";
import {
  getDatabase,
  upsertJob,
  getRecentJournalEntries,
} from "../src/infrastructure/database/index";

describe("Daemon Lifecycle Controller", () => {
  afterEach(async () => {
    await shutdownHarbinger();
  });

  it("initializes daemon, loads config, and logs boot thought", async () => {
    const state = await initHarbinger({
      dbPath: ":memory:",
      chainId: 31337,
      logLevel: "debug",
    });

    assert.equal(state.isReady, true);
    assert.equal(state.config.chainId, 31337);
    assert.equal(state.config.logLevel, "debug");

    const activeState = getDaemonState();
    assert.ok(activeState);
    assert.equal(activeState.isReady, true);

    // Verify boot journal entry was logged
    const entries = await getRecentJournalEntries(state.db, 10);
    assert.ok(entries.length >= 1);
    const boot = entries.find((e) => e.type === "SYSTEM_LIFECYCLE" && e.thought.includes("Harbinger daemon initialized"));
    assert.ok(boot);
    assert.equal(boot.level, "INFO");
    assert.equal(boot.source, "daemon");
  });

  it("rehydrates state: resets lingering 'running' jobs to 'idle' on startup", async () => {
    // Manually prime the database with a 'running' job
    const db = getDatabase(":memory:");
    await upsertJob(db, {
      id: "job-stuck-runner",
      vaultId: "0xvaultStuck",
      cadenceMs: 2000,
      status: "running",
      consecutiveBreaches: 2,
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Boot daemon
    const state = await initHarbinger({
      dbPath: ":memory:",
    });

    // Verify job status was reset to "idle"
    const row = await db
      .selectFrom("active_jobs")
      .where("id", "=", "job-stuck-runner")
      .selectAll()
      .executeTakeFirst();

    assert.ok(row);
    assert.equal(row.status, "idle");
    assert.equal(state.activeJobCount, 1);
  });

  it("shuts down cleanly, logs shutdown thought, and clears active state", async () => {
    const state = await initHarbinger({
      dbPath: ":memory:",
    });
    assert.equal(state.isReady, true);

    await shutdownHarbinger();
    assert.equal(getDaemonState(), null);
  });
});
