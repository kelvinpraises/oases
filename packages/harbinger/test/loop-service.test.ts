import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CronScheduler } from "../src/infrastructure/cron/scheduler";
import { LoopRunner } from "../src/infrastructure/cron/loop-runner";
import { LoopService } from "../src/services/loop/loop-service";
import { JournalService } from "../src/services/journal/journal-service";
import { FreshnessService } from "../src/services/graph/freshness-service";
import { GraphClient } from "../src/services/graph/graph-client";
import { getDatabase, closeDatabase } from "../src/infrastructure/database/connection";
import { compileAndCompressSolver } from "../src/services/oracle/solver-service";
import type { SolverManifest } from "../src/services/oracle";
import type { Job } from "../src/models/Job";
import type { Kysely } from "kysely";
import type { HarbingerDB } from "../src/infrastructure/database/schema";

class MockGraphClient extends GraphClient {
  constructor() {
    super("http://127.0.0.1:8000/subgraphs/name/test");
  }

  public override async queryBlock<T = unknown>(
    queryBody: string,
  ): Promise<{ data: T; indexerBlock: number }> {
    if (queryBody.includes("_meta")) {
      return {
        data: { _meta: { block: { number: 20_000_100 } } } as unknown as T,
        indexerBlock: 20_000_100,
      };
    }
    return {
      data: { data: { value: 50 } } as unknown as T,
      indexerBlock: 20_000_100,
    };
  }
}

describe("LoopService (Job Lifecycle Management)", () => {
  let db: Kysely<HarbingerDB>;
  let scheduler: CronScheduler;
  let journal: JournalService;
  let freshness: FreshnessService;
  let mockGraph: MockGraphClient;
  let runner: LoopRunner;
  let loopService: LoopService;

  const testManifest: SolverManifest = {
    version: "1.0.0",
    query: "query { data { value } }",
    timeBounds: {
      startBlock: 20_000_000,
      deadlineBlock: 20_000_500,
    },
    globals: { val: "data.value" },
    tree: [
      {
        id: "step1",
        type: "expr",
        formula: "val >= 100",
        output: "breached",
      },
    ],
    resolution: {
      triggerVariable: "breached",
      debounceBlocks: 2,
    },
  };

  const testQuery = testManifest.query ?? "";
  const { compiledConfig } = compileAndCompressSolver(testManifest);

  beforeEach(() => {
    db = getDatabase(":memory:");
    scheduler = new CronScheduler();
    journal = new JournalService(db);
    freshness = new FreshnessService();
    mockGraph = new MockGraphClient();
    runner = new LoopRunner(db, mockGraph, freshness, journal, scheduler);
    loopService = new LoopService(db, scheduler, runner, journal);
  });

  afterEach(async () => {
    scheduler.clearAll();
    await closeDatabase();
  });

  it("spawns a new active monitoring job and registers timer", async () => {
    const job: Job = {
      id: "job-spawn-1",
      vaultId: "vault-spawn-1",
      cadenceMs: 5_000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const spawned = await loopService.spawnJob(job, compiledConfig, testQuery);
    assert.equal(spawned.status, "running");
    assert.equal(scheduler.isScheduled("job-spawn-1"), true);
    assert.equal(scheduler.getCadence("job-spawn-1"), 5_000);

    const fromDb = await loopService.getJob("job-spawn-1");
    assert.ok(fromDb !== undefined);
    assert.equal(fromDb.status, "running");

    // Check thought recorded
    const thoughts = await journal.getRecentThoughts(10);
    assert.ok(thoughts.some((t) => t.thought.includes("Spawned monitoring loop for vault-spawn-1")));
  });

  it("returns existing job if already running (idempotency)", async () => {
    const job: Job = {
      id: "job-idempotent-1",
      vaultId: "vault-1",
      cadenceMs: 5_000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await loopService.spawnJob(job, compiledConfig, testQuery);
    const secondCall = await loopService.spawnJob(job, compiledConfig, testQuery);
    assert.equal(secondCall.status, "running");
    assert.equal(scheduler.isScheduled("job-idempotent-1"), true);
  });

  it("kills an active monitoring job cleanly", async () => {
    const job: Job = {
      id: "job-kill-1",
      vaultId: "vault-kill-1",
      cadenceMs: 5_000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await loopService.spawnJob(job, compiledConfig, testQuery);
    assert.equal(scheduler.isScheduled("job-kill-1"), true);

    await loopService.killJob("job-kill-1");
    assert.equal(scheduler.isScheduled("job-kill-1"), false);

    const fromDb = await loopService.getJob("job-kill-1");
    assert.equal(fromDb?.status, "stopped");

    const thoughts = await journal.getRecentThoughts(10);
    assert.ok(thoughts.some((t) => t.thought.includes("Killed monitoring loop for job job-kill-1")));
  });

  it("updates cadence dynamically", async () => {
    const job: Job = {
      id: "job-update-cadence",
      vaultId: "vault-cadence-1",
      cadenceMs: 10_000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await loopService.spawnJob(job, compiledConfig, testQuery);
    assert.equal(scheduler.getCadence("job-update-cadence"), 10_000);

    await loopService.updateCadence("job-update-cadence", 2_000, compiledConfig, testQuery);
    assert.equal(scheduler.getCadence("job-update-cadence"), 2_000);

    const fromDb = await loopService.getJob("job-update-cadence");
    assert.equal(fromDb?.cadenceMs, 2_000);
  });

  it("throws when updating cadence for non-existent job", async () => {
    await assert.rejects(
      () => loopService.updateCadence("job-missing", 1_000, compiledConfig, testQuery),
      /not found in database/,
    );
  });

  it("lists all active running jobs", async () => {
    const job1: Job = {
      id: "job-list-1",
      vaultId: "vault-1",
      cadenceMs: 5_000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const job2: Job = {
      id: "job-list-2",
      vaultId: "vault-2",
      cadenceMs: 5_000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await loopService.spawnJob(job1, compiledConfig, testQuery);
    await loopService.spawnJob(job2, compiledConfig, testQuery);

    const list = await loopService.listJobs();
    assert.ok(list.length >= 2);
    assert.ok(list.some((j) => j.id === "job-list-1"));
    assert.ok(list.some((j) => j.id === "job-list-2"));
  });

  it("reaps stale jobs when currentBlock >= deadlineBlock", async () => {
    const job: Job = {
      id: "job-reap-1",
      vaultId: "vault-reap-1",
      cadenceMs: 5_000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await loopService.spawnJob(job, compiledConfig, testQuery);

    // If current block is before deadline, nothing is reaped
    const reaped0 = await loopService.reapStaleJobs(20_000_100, 20_000_500);
    assert.equal(reaped0, 0);
    assert.equal(scheduler.isScheduled("job-reap-1"), true);

    // If current block is past deadline, job is reaped
    const reaped1 = await loopService.reapStaleJobs(20_000_501, 20_000_500);
    assert.equal(reaped1, 1);
    assert.equal(scheduler.isScheduled("job-reap-1"), false);

    const fromDb = await loopService.getJob("job-reap-1");
    assert.equal(fromDb?.status, "stopped");
  });
});
