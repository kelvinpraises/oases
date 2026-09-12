import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getDatabase, closeDatabase } from "../src/infrastructure/database/connection";
import { JournalService } from "../src/services/journal/journal-service";
import { LoopService } from "../src/services/loop/loop-service";
import { CronScheduler } from "../src/infrastructure/cron/scheduler";
import { LoopRunner } from "../src/infrastructure/cron/loop-runner";
import { FreshnessService } from "../src/services/graph/freshness-service";
import { GraphClient } from "../src/services/graph/graph-client";
import { createNeuralTools } from "../src/interfaces/neural/tools/index";
import {
  isToolAuthorized,
  authorizeTools,
  WITHHELD_MUTATION_TOOLS,
} from "../src/interfaces/neural/tool-authorization";
import { compileAndCompressSolver } from "../src/services/oracle/solver-service";
import type { SolverManifest } from "../src/services/oracle";
import type { Job } from "../src/models/Job";
import type { Kysely } from "kysely";
import type { HarbingerDB } from "../src/infrastructure/database/schema";

class MockGraphClient extends GraphClient {
  public simulatedResponses: Map<string, Record<string, unknown>> = new Map();

  constructor() {
    super("http://127.0.0.1:8000/subgraphs/name/test");
  }

  public override async queryBlock<T = unknown>(
    queryBody: string,
    targetBlock: number,
  ): Promise<{ data: T; indexerBlock: number }> {
    const canned = this.simulatedResponses.get(String(targetBlock)) ?? {
      data: { pool: { totalDebtUSD: 1000 } },
    };
    return {
      data: canned as unknown as T,
      indexerBlock: targetBlock,
    };
  }
}

describe("Neural Zod Tools & Authorization Security Gate", () => {
  let db: Kysely<HarbingerDB>;
  let journal: JournalService;
  let scheduler: CronScheduler;
  let runner: LoopRunner;
  let loopService: LoopService;
  let mockGraph: MockGraphClient;

  const testManifest: SolverManifest = {
    version: "1.0.0",
    query: "query CheckMetric { data { pool { totalDebtUSD } } }",
    timeBounds: { startBlock: 20_000_000, deadlineBlock: 20_000_500 },
    globals: { debt: "data.pool.totalDebtUSD" },
    tree: [
      {
        id: "step1",
        type: "expr",
        formula: "debt >= 500",
        output: "isHighDebt",
      },
    ],
    resolution: { triggerVariable: "isHighDebt", debounceBlocks: 2 },
  };

  const { compiledConfig: testConfig } = compileAndCompressSolver(testManifest);

  beforeEach(() => {
    db = getDatabase(":memory:");
    journal = new JournalService(db);
    scheduler = new CronScheduler();
    mockGraph = new MockGraphClient();
    runner = new LoopRunner(db, mockGraph, new FreshnessService(), journal, scheduler);
    loopService = new LoopService(db, scheduler, runner, journal);
  });

  afterEach(async () => {
    scheduler.clearAll();
    await closeDatabase();
  });

  describe("Tool Authorization Security Gate (Axiom 4.1)", () => {
    it("withholds all settlement mutation tools from neural interface", () => {
      assert.equal(isToolAuthorized("vault.resolve"), false);
      assert.equal(isToolAuthorized("executeSettlement"), false);
      assert.equal(isToolAuthorized("triggerRefund"), false);
      assert.equal(isToolAuthorized("resolveVault"), false);
      assert.equal(isToolAuthorized("settleMarket"), false);

      for (const withheldTool of WITHHELD_MUTATION_TOOLS) {
        assert.equal(isToolAuthorized(withheldTool), false);
      }
    });

    it("authorizes declared read-only and monitoring tool surfaces", () => {
      assert.equal(isToolAuthorized("logThought"), true);
      assert.equal(isToolAuthorized("spawnJob"), true);
      assert.equal(isToolAuthorized("updateCadence"), true);
      assert.equal(isToolAuthorized("querySubgraph"), true);
      assert.equal(isToolAuthorized("evaluateMetric"), true);
      assert.equal(isToolAuthorized("checkPrecedence"), true);
      assert.equal(isToolAuthorized("dryRunTicket"), true);
    });

    it("authorizeTools filters out prohibited mutation surfaces from registry map", () => {
      const toolMap = {
        legitTool: { id: "logThought" },
        maliciousResolve: { id: "vault.resolve" },
        maliciousSettlement: { id: "executeSettlement" },
      };

      const result = authorizeTools(toolMap);
      assert.ok(result.authorized.legitTool !== undefined);
      assert.equal(result.authorized.maliciousResolve, undefined);
      assert.equal(result.authorized.maliciousSettlement, undefined);
      assert.equal(result.withheld.length, 2);
      assert.ok(result.withheld.includes("vault.resolve"));
      assert.ok(result.withheld.includes("executeSettlement"));
    });
  });

  describe("Zod Tool Input Validation & Safe Cadence Bounds (Axiom 4.4)", () => {
    it("enforces cadence bounds (1,000ms <= cadence <= 60,000ms) on updateCadenceTool", async () => {
      const tools = createNeuralTools({
        journalService: journal,
        loopService,
        graphClient: mockGraph,
      });

      const job: Job = {
        id: "job-cadence-test",
        vaultId: "vault-1",
        cadenceMs: 10_000,
        status: "idle",
        consecutiveBreaches: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await loopService.spawnJob(job, testConfig, testManifest.query ?? "");

      // 1. Valid update (5,000ms)
      const res = await tools.updateCadence.execute({
        jobId: "job-cadence-test",
        newCadenceMs: 5_000,
        reason: "Tightening monitor due to borrow uptick",
        solverConfig: testConfig,
        queryBody: testManifest.query ?? "",
      });

      assert.equal(res.success, true);
      assert.equal(res.cadenceMs, 5_000);

      // 2. Reject cadence < 1,000ms (Axiom 4.4)
      await assert.rejects(
        () =>
          tools.updateCadence.execute({
            jobId: "job-cadence-test",
            newCadenceMs: 500, // Invalid: < 1000
            reason: "Too fast",
            solverConfig: testConfig,
            queryBody: testManifest.query ?? "",
          }),
        /Cadence cannot be lower than 1,000ms/,
      );

      // 3. Reject cadence > 60,000ms (Axiom 4.4)
      await assert.rejects(
        () =>
          tools.updateCadence.execute({
            jobId: "job-cadence-test",
            newCadenceMs: 90_000, // Invalid: > 60000
            reason: "Too slow",
            solverConfig: testConfig,
            queryBody: testManifest.query ?? "",
          }),
        /Cadence cannot exceed 60,000ms/,
      );
    });

    it("validates logThought tool inputs via Zod schema", async () => {
      const tools = createNeuralTools({
        journalService: journal,
        loopService,
        graphClient: mockGraph,
      });

      // Valid thought
      const res = await tools.logThought.execute({
        level: "ALERT",
        thought: "Whale collateral ratio dropped toward liquidation threshold.",
        confidenceScore: 0.95,
        relatedVaultId: "vault-actor-whale",
      });

      assert.equal(res.success, true);
      assert.ok(res.entryId.startsWith("jrn-"));

      // Reject too short (< 5 chars)
      await assert.rejects(
        () =>
          tools.logThought.execute({
            level: "ALERT",
            thought: "Hi",
            confidenceScore: 0.9,
          }),
        /Thought must be at least 5 characters/,
      );

      // Reject confidence out of bounds
      await assert.rejects(
        () =>
          tools.logThought.execute({
            level: "INFO",
            thought: "Valid length thought",
            confidenceScore: 1.5,
          }),
        /(Number must be less than or equal to 1|Too big|too_big)/,
      );
    });

    it("executes spawnJob, listJobs, and killJob tools", async () => {
      const tools = createNeuralTools({
        journalService: journal,
        loopService,
        graphClient: mockGraph,
      });

      // Spawn
      const spawnRes = await tools.spawnJob.execute({
        id: "job-via-tool",
        vaultId: "vault-tool-1",
        cadenceMs: 8_000,
        solverConfig: testConfig,
        queryBody: testManifest.query ?? "",
      });
      assert.equal(spawnRes.success, true);
      assert.equal(spawnRes.job.status, "running");

      // List
      const listRes = await tools.listJobs.execute({});
      assert.ok(listRes.count >= 1);
      assert.ok(listRes.jobs.some((j: any) => j.id === "job-via-tool"));

      // Kill
      const killRes = await tools.killJob.execute({ jobId: "job-via-tool" });
      assert.equal(killRes.success, true);
      assert.equal(scheduler.isScheduled("job-via-tool"), false);
    });

    it("executes querySubgraph and evaluateMetric observation tools", async () => {
      const tools = createNeuralTools({
        journalService: journal,
        loopService,
        graphClient: mockGraph,
      });

      // querySubgraph
      const queryRes = await tools.querySubgraph.execute({
        query: "{ pool { totalDebtUSD } }",
        targetBlock: 20_000_100,
      });
      assert.equal(queryRes.success, true);
      assert.equal(queryRes.indexerBlock, 20_000_100);

      // evaluateMetric
      const evalRes = await tools.evaluateMetric.execute({
        vaultId: "vault-1",
        blockNumber: 20_000_100,
        queryBody: testManifest.query ?? "",
        solverConfig: testConfig,
      });
      assert.equal(evalRes.success, true);
      assert.equal(evalRes.triggered, true); // totalDebtUSD 1000 >= 500
    });

    it("executes read-only checkPrecedence and dryRunTicket resolution tools", async () => {
      const tools = createNeuralTools({
        journalService: journal,
        loopService,
        graphClient: mockGraph,
      });

      // checkPrecedence
      const precRes = await tools.checkPrecedence.execute({
        breachBlock: 20_000_102,
        startBlock: 20_000_000,
        deadlineBlock: 20_000_500,
        consecutiveBreachBlocks: 2,
        requiredDebounce: 2,
      });
      assert.equal(precRes.success, true);
      assert.equal(precRes.proof.decision, "RESOLVED_YES");

      // dryRunTicket
      const ticketRes = await tools.dryRunTicket.execute({
        vaultId: "vault-test",
        solverConfig: testConfig,
        breachBlock: 20_000_102,
        snapshots: [
          {
            blockNumber: 20_000_101,
            inputs: { debt: 600 },
            intermediate: { isHighDebt: true },
            trigger: true,
          },
          {
            blockNumber: 20_000_102,
            inputs: { debt: 700 },
            intermediate: { isHighDebt: true },
            trigger: true,
          },
        ],
      });
      assert.equal(ticketRes.success, true);
      assert.equal(ticketRes.ticket.decision, "RESOLVED_YES");
      assert.equal(ticketRes.ticket.blockSnapshots.length, 2);
    });
  });
});
