import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getDatabase, closeDatabase } from "../src/infrastructure/database/connection";
import { JournalService } from "../src/services/journal/journal-service";
import { LoopService } from "../src/services/loop/loop-service";
import { CronScheduler } from "../src/infrastructure/cron/scheduler";
import { LoopRunner } from "../src/infrastructure/cron/loop-runner";
import { FreshnessService } from "../src/services/graph/freshness-service";
import { GraphClient } from "../src/services/graph/graph-client";
import {
  createNeuralAgent,
  DetectiveAgent,
  renderSystemPrompt,
  renderDirectiveContext,
  type PerceptionContext,
} from "../src/interfaces/neural/index";
import type { SourceDirective } from "../src/models/Directive";
import type { ContagionCluster } from "../src/services/tension-cast/types";
import type { Kysely } from "kysely";
import type { HarbingerDB } from "../src/infrastructure/database/schema";

class MockGraphClient extends GraphClient {
  constructor() {
    super("http://127.0.0.1:8000/subgraphs/name/test");
  }
}

describe("Neural Cognitive Interface & Detective Agent", () => {
  let db: Kysely<HarbingerDB>;
  let journal: JournalService;
  let scheduler: CronScheduler;
  let runner: LoopRunner;
  let loopService: LoopService;
  let mockGraph: MockGraphClient;

  const mockDirective: SourceDirective = {
    marketId: "0xmarket1234",
    title: "Aave CRV Cascade",
    streamId: "stream-1",
    creator: "0xcreator",
    startBlock: 20_000_000,
    deadlineBlock: 20_000_500,
    childVaults: [
      {
        vaultId: "vault-actor-1",
        marketId: "0xmarket1234",
        classType: "Actor",
        targetAddress: "0x7a",
        question: "Will Whale HF <= 1.0?",
        compiledSolverConfig: "cfg-1",
      },
      {
        vaultId: "vault-place-1",
        marketId: "0xmarket1234",
        classType: "Place",
        targetAddress: "0xpool",
        question: "Will Aave Reserves drop > 40%?",
        compiledSolverConfig: "cfg-2",
      },
    ],
  };

  const mockCluster: ContagionCluster = {
    directiveId: "0xmarket1234",
    actors: [mockDirective.childVaults[0]],
    places: [mockDirective.childVaults[1]],
    acts: [],
    bonds: [],
    totalVaultCount: 2,
  };

  const mockContext: PerceptionContext = {
    directive: mockDirective,
    cluster: mockCluster,
    activeJobs: [
      {
        id: "job-1",
        vaultId: "vault-actor-1",
        cadenceMs: 10_000,
        status: "running",
        consecutiveBreaches: 0,
        lastTickBlock: 20_000_100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    recentThoughts: [],
    operatorDirectives: ["Focus on Whale 0x7a liquidation contagion"],
  };

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

  it("renders prompt perception context across 4-Class Physical Taxonomy", () => {
    const directiveContext = renderDirectiveContext(mockDirective, mockCluster, 20_000_150);
    assert.ok(directiveContext.includes("Aave CRV Cascade"));
    assert.ok(directiveContext.includes("Remaining: 350 blocks"));
    assert.ok(directiveContext.includes("vault-actor-1"));
    assert.ok(directiveContext.includes("vault-place-1"));

    const systemPrompt = renderSystemPrompt(mockContext, 20_000_150);
    assert.ok(systemPrompt.includes("Harbinger Detective Agent"));
    assert.ok(systemPrompt.includes("AIR-GAPPED SETTLEMENT INVARIANT (Axiom 4.1)"));
    assert.ok(systemPrompt.includes("Focus on Whale 0x7a liquidation contagion"));
    assert.ok(systemPrompt.includes("Job job-1 (vault-actor-1)"));
  });

  it("executes qualitative analysis cycle and commits thought to journal", async () => {
    const neuralAgent = createNeuralAgent(journal, loopService);

    await neuralAgent.runAnalysis(mockContext);

    const thoughts = await journal.getRecentThoughts(10);
    assert.ok(thoughts.length >= 1);
    const analysisThought = thoughts.find((t) => t.type === "CLUSTER_SYNTHESIS");
    assert.ok(analysisThought !== undefined);
    assert.equal(analysisThought.source, "detective_agent");
    assert.ok(analysisThought.thought.includes("Investigated contagion arcs"));
    assert.deepEqual(analysisThought.metadata?.marketId, "0xmarket1234");
  });

  it("interrupts analysis cycle cleanly on operator abort without throwing", async () => {
    let inferenceStarted = false;
    const delayedAgent = new DetectiveAgent(
      "delayedAgent",
      "Tests abort signal",
      async (_prompt, signal) => {
        inferenceStarted = true;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 300);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("Analysis aborted by operator");
            err.name = "AbortError";
            reject(err);
          });
        });
        return { thought: "Completed", cadenceAdjusted: false, toolCallsExecuted: [] };
      },
    );

    const neuralAgent = createNeuralAgent(journal, loopService, mockGraph, delayedAgent);

    const analysisPromise = neuralAgent.runAnalysis(mockContext);

    // Give time to enter inference
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(inferenceStarted, true);
    assert.equal(neuralAgent.isAnalyzing("0xmarket1234"), true);

    const interrupted = neuralAgent.interruptAnalysis("0xmarket1234");
    assert.equal(interrupted, true);

    // Await promise completion: should complete cleanly without unhandled rejection
    await analysisPromise;
    assert.equal(neuralAgent.isAnalyzing("0xmarket1234"), false);
  });

  it("enforces Axiom 4.7 Coalesced Observation Mailbox during in-flight inference", async () => {
    const executionThoughts: string[] = [];
    const executionObservationsCount: number[] = [];

    const controllableAgent = new DetectiveAgent(
      "controllableAgent",
      "Tests Coalesced Mailbox",
      async (prompt) => {
        // Count how many observations were injected in the prompt
        const match = prompt.match(/- \[Block \d+\]/g);
        executionObservationsCount.push(match ? match.length : 0);

        // Simulate inference duration
        await new Promise((resolve) => setTimeout(resolve, 60));
        executionThoughts.push("Finished inference cycle");
        return {
          thought: `Cycle evaluated with observations.`,
          cadenceAdjusted: false,
          toolCallsExecuted: [],
        };
      },
    );

    const neuralAgent = createNeuralAgent(journal, loopService, mockGraph, controllableAgent);

    // Launch Cycle 1
    const cycle1Promise = neuralAgent.runAnalysis(mockContext);
    assert.equal(neuralAgent.isAnalyzing("0xmarket1234"), true);

    // While Cycle 1 is in-flight, triggers arrive in the mailbox
    await neuralAgent.handleObservationTrigger(
      "0xmarket1234",
      { block: 20_000_105, note: "Reserve imbalance alert", metricValue: 0.35 },
      mockContext,
    );

    await neuralAgent.handleObservationTrigger(
      "0xmarket1234",
      { block: 20_000_106, note: "Whale borrow spike", metricValue: 0.82 },
      mockContext,
    );

    // Verify observations are buffered in mailbox while Cycle 1 runs
    assert.equal(neuralAgent.getMailboxPendingCount("0xmarket1234"), 2);

    // Wait for trailing-edge loop to drain and execute Cycle 2
    await cycle1Promise;

    // Both cycles must have executed sequentially
    assert.equal(executionThoughts.length, 2);
    assert.equal(executionObservationsCount[0], 0); // Cycle 1 had 0 mailbox observations
    assert.equal(executionObservationsCount[1], 2); // Cycle 2 bundled both coalesced observations!
    assert.equal(neuralAgent.getMailboxPendingCount("0xmarket1234"), 0); // Mailbox drained
  });

  it("handles operator directives via respondToUser", async () => {
    const neuralAgent = createNeuralAgent(journal, loopService);

    const response = await neuralAgent.respondToUser("0xmarket1234", "Halt borrowing checks on CRV");
    assert.ok(response.includes("Acknowledged operator directive"));

    const thoughts = await journal.getRecentThoughts(5);
    const directiveThought = thoughts.find((t) => t.source === "operator_interface");
    assert.ok(directiveThought !== undefined);
    assert.ok(directiveThought.thought.includes("Halt borrowing checks on CRV"));
  });
});
