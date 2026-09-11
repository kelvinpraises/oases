import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { CronScheduler } from "../src/infrastructure/cron/scheduler";
import { LoopRunner } from "../src/infrastructure/cron/loop-runner";
import { JournalService } from "../src/services/journal/journal-service";
import { FreshnessService } from "../src/services/graph/freshness-service";
import { GraphClient } from "../src/services/graph/graph-client";
import { getDatabase, closeDatabase } from "../src/infrastructure/database/connection";
import { compileAndCompressSolver } from "../src/services/oracle/solver-service";
import type { SolverManifest } from "../src/pipeline/types";
import type { Job } from "../src/models/Job";
import type { ReplayTicket } from "../src/models/ReplayTicket";
import type { Kysely } from "kysely";
import type { HarbingerDB } from "../src/infrastructure/database/schema";

/**
 * Controllable Mock GraphClient for testing block advancement and AST queries.
 */
class MockGraphClient extends GraphClient {
  public currentBlockNumber = 20_000_100;
  public simulatedResponses: Map<string, Record<string, unknown>> = new Map();
  public shouldFail = false;
  public failureError = new Error("Simulated network timeout");
  public delayMs = 0;

  constructor() {
    super("http://127.0.0.1:8000/subgraphs/name/test");
  }

  public override async queryBlock<T = unknown>(
    queryBody: string,
    targetBlock: number,
  ): Promise<{ data: T; indexerBlock: number }> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      throw this.failureError;
    }

    if (queryBody.includes("_meta")) {
      return {
        data: { _meta: { block: { number: this.currentBlockNumber } } } as unknown as T,
        indexerBlock: this.currentBlockNumber,
      };
    }

    const blockKey = `${targetBlock}:${queryBody.slice(0, 30)}`;
    const canned =
      this.simulatedResponses.get(blockKey) ??
      this.simulatedResponses.get(String(targetBlock)) ??
      {};

    return {
      data: canned as unknown as T,
      indexerBlock: this.currentBlockNumber,
    };
  }
}

describe("Reflex Loop & Cron Infrastructure", () => {
  let db: Kysely<HarbingerDB>;
  let scheduler: CronScheduler;
  let journal: JournalService;
  let freshness: FreshnessService;
  let mockGraph: MockGraphClient;
  let loopRunner: LoopRunner;

  const testManifest: SolverManifest = {
    version: "1.0.0",
    query: "query CheckMetric { data { value } }",
    timeBounds: {
      startBlock: 20_000_000,
      deadlineBlock: 20_000_500,
    },
    globals: {
      val: "data.value",
    },
    tree: [
      {
        id: "step1",
        type: "expr",
        formula: "val >= 100",
        output: "isBreached",
      },
    ],
    resolution: {
      triggerVariable: "isBreached",
      debounceBlocks: 2,
    },
  };

  const testQuery = testManifest.query ?? "";
  const { compiledConfig: testSolverConfig } = compileAndCompressSolver(testManifest);

  beforeEach(() => {
    db = getDatabase(":memory:");
    scheduler = new CronScheduler();
    journal = new JournalService(db);
    freshness = new FreshnessService();
    mockGraph = new MockGraphClient();
    loopRunner = new LoopRunner(db, mockGraph, freshness, journal, scheduler, {
      defaultCadenceMs: 10_000,
      acceleratedCadenceMs: 2_000,
    });
  });

  afterEach(async () => {
    scheduler.clearAll();
    await closeDatabase();
  });

  describe("CronScheduler", () => {
    it("registers, executes ticks, updates cadence, and unregisters jobs", async () => {
      let tickCount = 0;
      scheduler.registerJob("test-job-1", 50, () => {
        tickCount++;
      });

      assert.equal(scheduler.isScheduled("test-job-1"), true);
      assert.equal(scheduler.getCadence("test-job-1"), 50);

      // Wait for tick
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.ok(tickCount >= 1, `Expected at least 1 tick, got ${tickCount}`);

      // Update cadence
      scheduler.updateCadence("test-job-1", 200, () => {
        tickCount++;
      });
      assert.equal(scheduler.getCadence("test-job-1"), 200);

      // Unregister
      scheduler.unregisterJob("test-job-1");
      assert.equal(scheduler.isScheduled("test-job-1"), false);
      assert.equal(scheduler.getCadence("test-job-1"), undefined);
    });

    it("throws when updating cadence for non-existent job", () => {
      assert.throws(
        () => scheduler.updateCadence("non-existent", 100, () => {}),
        /is not scheduled/,
      );
    });
  });

  describe("LoopRunner — Mutex & Debounce Watcher", () => {
    it("enforces skip-if-busy mutex (Axiom 3.2)", async () => {
      const job: Job = {
        id: "job-mutex-1",
        vaultId: "vault-1",
        cadenceMs: 10_000,
        status: "running",
        consecutiveBreaches: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockGraph.delayMs = 150;
      mockGraph.simulatedResponses.set("20000100", { data: { value: 50 } });

      // Launch tick 1 (async with delay)
      const tick1Promise = loopRunner.executeTick(job, testSolverConfig, testQuery);

      // Immediately launch tick 2 concurrently
      const tick2Result = await loopRunner.executeTick(job, testSolverConfig, testQuery);

      // Tick 2 must be dropped synchronously by mutex
      assert.equal(tick2Result, null);

      // Await tick 1 completion
      const tick1Result = await tick1Promise;
      assert.ok(tick1Result !== null);
      assert.equal(tick1Result.conditionMet, false);
    });

    it("treats tick on same block height as no-op", async () => {
      const job: Job = {
        id: "job-same-block",
        vaultId: "vault-1",
        cadenceMs: 10_000,
        status: "running",
        lastTickBlock: 20_000_100,
        consecutiveBreaches: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockGraph.currentBlockNumber = 20_000_100; // Same block as lastTickBlock

      const result = await loopRunner.executeTick(job, testSolverConfig, testQuery);
      assert.ok(result !== null);
      assert.equal(result.skipped, true);
      assert.equal(result.consecutiveBreaches, 1); // Debounce counter preserved
    });

    it("enforces strict 2-block confirmation debounce (Axiom 3.1)", async () => {
      let breachConfirmedEvent: {
        jobId: string;
        vaultId: string;
        replayTicket: ReplayTicket;
      } | null = null;
      const runnerWithCallback = new LoopRunner(
        db,
        mockGraph,
        freshness,
        journal,
        scheduler,
        {
          defaultCadenceMs: 10_000,
          acceleratedCadenceMs: 2_000,
          onBreachConfirmed: (event) => {
            breachConfirmedEvent = event;
          },
        },
      );

      const job: Job = {
        id: "job-debounce",
        vaultId: "vault-aave-whale",
        cadenceMs: 10_000,
        status: "running",
        consecutiveBreaches: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Block 20000101: Value = 150 (Breach 1)
      mockGraph.currentBlockNumber = 20_000_101;
      mockGraph.simulatedResponses.set("20000101", { data: { value: 150 } });

      const tick1 = await runnerWithCallback.executeTick(job, testSolverConfig, testQuery);
      assert.ok(tick1 !== null);
      assert.equal(tick1.conditionMet, true);
      assert.equal(tick1.consecutiveBreaches, 1);
      assert.equal(tick1.debounceConfirmed, false);
      assert.equal(tick1.replayTicket, undefined);
      assert.equal(Boolean(breachConfirmedEvent), false);
      assert.equal(job.cadenceMs, 2_000); // Accelerated hysteresis

      // Block 20000102: Value = 160 (Consecutive Breach 2 -> Confirmed!)
      mockGraph.currentBlockNumber = 20_000_102;
      mockGraph.simulatedResponses.set("20000102", { data: { value: 160 } });

      const tick2 = await runnerWithCallback.executeTick(job, testSolverConfig, testQuery);
      assert.ok(tick2 !== null);
      assert.equal(tick2.conditionMet, true);
      assert.equal(tick2.consecutiveBreaches, 2);
      assert.equal(tick2.debounceConfirmed, true);
      assert.ok(tick2.replayTicket !== undefined);
      assert.equal(tick2.replayTicket.decision, "RESOLVED_YES");
      assert.equal(tick2.replayTicket.blockSnapshots.length, 2);
      assert.equal(tick2.replayTicket.blockSnapshots[0].blockNumber, 20_000_101);
      assert.equal(tick2.replayTicket.blockSnapshots[1].blockNumber, 20_000_102);

      // Callback must have fired
      const event = breachConfirmedEvent as unknown as {
        jobId: string;
        vaultId: string;
        replayTicket: ReplayTicket;
      } | null;
      assert.ok(event !== null);
      assert.equal(event.jobId, "job-debounce");
      assert.equal(event.vaultId, "vault-aave-whale");
    });

    it("resets debounce to 1 on non-consecutive block gap (Axiom 3.1)", async () => {
      const job: Job = {
        id: "job-gap",
        vaultId: "vault-1",
        cadenceMs: 10_000,
        status: "running",
        consecutiveBreaches: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Block 100: Breach 1
      mockGraph.currentBlockNumber = 20_000_100;
      mockGraph.simulatedResponses.set("20000100", { data: { value: 120 } });
      const tick1 = await loopRunner.executeTick(job, testSolverConfig, testQuery);
      assert.equal(tick1?.consecutiveBreaches, 1);

      // Block 102: Gap of 2 blocks (e.g. indexer skipped block 101)
      mockGraph.currentBlockNumber = 20_000_102;
      mockGraph.simulatedResponses.set("20000102", { data: { value: 130 } });
      const tick2 = await loopRunner.executeTick(job, testSolverConfig, testQuery);

      // Must reset to 1 because 102 !== 100 + 1
      assert.equal(tick2?.consecutiveBreaches, 1);
      assert.equal(tick2?.debounceConfirmed, false);
      assert.equal(tick2?.replayTicket, undefined);
    });

    it("resets debounce to 0 when metric recovers to healthy (calm)", async () => {
      const job: Job = {
        id: "job-recovery",
        vaultId: "vault-1",
        cadenceMs: 10_000,
        status: "running",
        consecutiveBreaches: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Block 100: Breach 1
      mockGraph.currentBlockNumber = 20_000_100;
      mockGraph.simulatedResponses.set("20000100", { data: { value: 120 } });
      await loopRunner.executeTick(job, testSolverConfig, testQuery);
      assert.equal(job.consecutiveBreaches, 1);
      assert.equal(job.cadenceMs, 2_000);

      // Block 101: Value drops back to 80 (Calm)
      mockGraph.currentBlockNumber = 20_000_101;
      mockGraph.simulatedResponses.set("20000101", { data: { value: 80 } });
      const tick2 = await loopRunner.executeTick(job, testSolverConfig, testQuery);

      assert.equal(tick2?.conditionMet, false);
      assert.equal(tick2?.consecutiveBreaches, 0);
      assert.equal(job.cadenceMs, 10_000); // Relaxed hysteresis back to 10s
    });

    it("reconstitutes prior block snapshot via Time-Travel query after crash restart", async () => {
      const job: Job = {
        id: "job-crash-recovery",
        vaultId: "vault-crash",
        cadenceMs: 2_000,
        status: "running",
        lastTickBlock: 20_000_100, // Process crashed after block 100 breached
        consecutiveBreaches: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // In-memory snapshots are empty (simulating cold boot)
      assert.equal(loopRunner.getPendingSnapshots("job-crash-recovery").length, 0);

      // Configure mock data for block 100 (Time-Travel historical backfill) and block 101 (current)
      mockGraph.currentBlockNumber = 20_000_101;
      mockGraph.simulatedResponses.set("20000100", { data: { value: 110 } });
      mockGraph.simulatedResponses.set("20000101", { data: { value: 115 } });

      const tick = await loopRunner.executeTick(job, testSolverConfig, testQuery);

      assert.ok(tick !== null);
      assert.equal(tick.consecutiveBreaches, 2);
      assert.equal(tick.debounceConfirmed, true);
      assert.ok(tick.replayTicket !== undefined);
      assert.equal(tick.replayTicket.blockSnapshots.length, 2);
      assert.equal(tick.replayTicket.blockSnapshots[0].blockNumber, 20_000_100);
      assert.equal(tick.replayTicket.blockSnapshots[1].blockNumber, 20_000_101);
    });

    it("self-terminates monitoring loop when deadlineBlock is exceeded (dual-layer guard)", async () => {
      scheduler.registerJob("job-expiry", 10_000, () => {});
      const job: Job = {
        id: "job-expiry",
        vaultId: "vault-expired",
        cadenceMs: 10_000,
        status: "running",
        consecutiveBreaches: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Manifest deadlineBlock is 20_000_500. Set current block past deadline:
      mockGraph.currentBlockNumber = 20_000_501;

      const result = await loopRunner.executeTick(job, testSolverConfig, testQuery);

      assert.ok(result !== null);
      assert.equal(result.expired, true);
      assert.equal(job.status, "stopped");
      assert.equal(scheduler.isScheduled("job-expiry"), false);
    });

    it("preserves debounce counter on transient network query error", async () => {
      const job: Job = {
        id: "job-network-error",
        vaultId: "vault-1",
        cadenceMs: 2_000,
        status: "running",
        lastTickBlock: 20_000_100,
        consecutiveBreaches: 1, // Already breached block 1
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      mockGraph.shouldFail = true;

      const result = await loopRunner.executeTick(job, testSolverConfig, testQuery);

      assert.equal(result, null);
      assert.equal(job.consecutiveBreaches, 1); // Debounce counter preserved!
    });
  });
});
