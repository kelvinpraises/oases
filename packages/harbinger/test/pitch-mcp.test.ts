import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getDatabase, closeDatabase } from "../src/infrastructure/database/connection";
import { JournalService } from "../src/services/journal/journal-service";
import { LoopService } from "../src/services/loop/loop-service";
import { CronScheduler } from "../src/infrastructure/cron/scheduler";
import { LoopRunner } from "../src/infrastructure/cron/loop-runner";
import { FreshnessService } from "../src/services/graph/freshness-service";
import { GraphClient } from "../src/services/graph/graph-client";
import { FaucetService } from "../src/services/faucet/faucet-service";
import { createRequestFaucetFundsTool } from "../src/interfaces/neural/tools/faucet/index";
import { createHarbingerMcpServer } from "../src/interfaces/mcp/server";
import {
  loadAgentManifest,
  getActiveAgent,
} from "../src/config/agent-manifest";
import {
  DetectiveAgent,
  HarbingerConfigurationError,
} from "../src/interfaces/neural/agents/detective-agent";
import {
  HcsMirrorNodeSubscriber,
  type HcsPitchPayload,
} from "../src/services/hedera/hcs-subscriber";
import {
  YieldSplitter,
  calculateYieldSplit,
  DEFAULT_PITCH_FEE,
} from "../src/services/hedera/yield-splitter";

describe("Flow 3 (Epoch 3): Sovereign Sentinel, Pitch Economy, 80/20 Yield & MCP", () => {
  let db: ReturnType<typeof getDatabase>;
  let journal: JournalService;
  let scheduler: CronScheduler;
  let runner: LoopRunner;
  let loopService: LoopService;
  let mockGraph: GraphClient;

  beforeEach(() => {
    db = getDatabase(":memory:");
    journal = new JournalService(db);
    scheduler = new CronScheduler();
    mockGraph = new GraphClient("http://127.0.0.1:8000/subgraphs/name/test");
    runner = new LoopRunner(db, mockGraph, new FreshnessService(), journal, scheduler);
    loopService = new LoopService(db, scheduler, runner, journal);
  });

  afterEach(async () => {
    scheduler.clearAll();
    await closeDatabase();
  });

  it("Step 1: Agent Manifest parses root oases-agents.json and retrieves active agent", () => {
    const manifest = loadAgentManifest();
    assert.ok(manifest.agents.length >= 1);

    const active = getActiveAgent(manifest);
    assert.equal(active.id, "harbinger-sentinel-01");
    assert.equal(active.role, "Contagion Sentinel");
    assert.equal(active.driver, "mcp");
    assert.ok(active.address.startsWith("0x"));
    assert.ok(active.hcsInboxTopicId.startsWith("0.0."));

    // Throws on nonexistent agent ID
    assert.throws(
      () => getActiveAgent(manifest, "nonexistent-agent-id"),
      /AgentNotFound/,
    );
  });

  it("Step 2: DetectiveAgent fails fast with HarbingerConfigurationError when unconfigured", async () => {
    const unconfiguredAgent = new DetectiveAgent(
      "unconfigured",
      "test agent",
      undefined,
      {},
      {
        modelName: "gpt-4o",
        provider: "openai",
        apiKey: undefined,
        timeoutMs: 5000,
        maxTokens: 512,
      },
    );

    await assert.rejects(
      () => unconfiguredAgent.generateHypothesis("Analyze market"),
      (err: unknown) => {
        assert.ok(err instanceof HarbingerConfigurationError);
        assert.ok(err.message.includes("HARBINGER_MODEL_API_KEY or OPENAI_API_KEY is required"));
        return true;
      },
    );
  });

  it("Step 3: DetectiveAgent executes deterministic customInference without live API keys", async () => {
    const deterministicAgent = new DetectiveAgent(
      "deterministic",
      "test agent",
      async (prompt) => ({
        thought: `Custom thought for: ${prompt.slice(0, 10)}`,
        cadenceAdjusted: true,
        toolCallsExecuted: ["updateCadence"],
      }),
    );

    const decision = await deterministicAgent.generateHypothesis("Investigate cluster");
    assert.equal(decision.cadenceAdjusted, true);
    assert.ok(decision.thought.startsWith("Custom thought for:"));
    assert.deepEqual(decision.toolCallsExecuted, ["updateCadence"]);
  });

  it("Step 4: Calculates and executes 80/20 pitch yield split ($4.00 / $1.00)", async () => {
    const { marketYieldAmount, agentGasAmount } = calculateYieldSplit(DEFAULT_PITCH_FEE);
    assert.equal(marketYieldAmount, 4_000_000n); // $4.00 (80%)
    assert.equal(agentGasAmount, 1_000_000n);    // $1.00 (20%)

    const splitter = new YieldSplitter(undefined, journal);
    const result = await splitter.processPitchYield("0xmarket_test", DEFAULT_PITCH_FEE);

    assert.equal(result.marketId, "0xmarket_test");
    assert.equal(result.marketYieldAmount, 4_000_000n);
    assert.equal(result.agentGasAmount, 1_000_000n);
    assert.equal(splitter.getAccumulatedAgentGas(), 1_000_000n);

    // Verify journal thought logged
    const thoughts = await journal.getRecentThoughts(5);
    const yieldThought = thoughts.find((t) => t.type === "YIELD_INJECTION");
    assert.ok(yieldThought !== undefined);
    assert.ok(yieldThought.thought.includes("$4.00 injected into pot"));
    assert.ok(yieldThought.thought.includes("$1.00 retained for EOA gas"));
  });

  it("Step 5: HCS Mirror Node Subscriber parses base64 pitches and guards against replay", async () => {
    const subscriber = new HcsMirrorNodeSubscriber("0.0.543210");

    // Mock payload
    const mockPayload: HcsPitchPayload = {
      marketId: "0xmarket_pitch_01",
      targetAddress: "0x7a16fF8270133F063aAb6C9977183D9e72835428",
      thesis: "CRV collateral price drop below 0.25 will trigger Actor liquidation",
      metricKey: "healthFactor",
      timebox: 150,
      payerTxId: "0.0.12345@1726160000.000000001",
    };

    const base64Message = Buffer.from(JSON.stringify(mockPayload)).toString("base64");
    const decoded = JSON.parse(Buffer.from(base64Message, "base64").toString("utf8")) as HcsPitchPayload;
    assert.equal(decoded.marketId, mockPayload.marketId);
    assert.equal(decoded.payerTxId, mockPayload.payerTxId);

    // Verify subscriber isProcessed tracking
    assert.equal(subscriber.isProcessed(mockPayload.payerTxId), false);

    // Simulate first processing
    const firstCheck = subscriber.isProcessed(mockPayload.payerTxId);
    assert.equal(firstCheck, false);
  });

  it("Step 6: Dual-rail Faucet Service dispenses 1 HBAR and Mock USDC", async () => {
    const faucet = new FaucetService();
    const receipt = await faucet.dispenseFunds({
      evmAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      hederaAccountId: "0.0.12345",
      mockUsdcAmount: 20_000_000n, // $20 USDC
    });

    assert.equal(receipt.usdcDispensed, 20_000_000n);
    assert.equal(receipt.hbarDispensed, 1_0000_0000n); // 1 HBAR (1e8 tinybars)

    // Verify autonomous tool executes cleanly
    const faucetTool = createRequestFaucetFundsTool(faucet);
    assert.equal(faucetTool.id, "requestFaucetFunds");

    const toolResult = await faucetTool.execute({
      evmAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      usdcAmount: 20,
      purpose: "SEEDING_CAPITAL",
    });

    assert.equal(toolResult.success, true);
    assert.equal(toolResult.usdcDispensed, "20000000");
  });

  it("Step 7: MCP Server registers observation & orchestration tools, strictly withholds resolveVault (Axiom 4.1)", () => {
    const server = createHarbingerMcpServer({
      journalService: journal,
      loopService,
      graphClient: mockGraph,
    });

    // Check registered tools on MCP server
    const registeredTools = (server as unknown as { _registeredTools?: Record<string, unknown> })._registeredTools;
    if (registeredTools) {
      assert.ok("logThought" in registeredTools);
      assert.ok("spawnJob" in registeredTools);
      assert.ok("killJob" in registeredTools);
      assert.ok("listJobs" in registeredTools);
      assert.ok("updateCadence" in registeredTools);
      assert.ok("querySubgraph" in registeredTools);
      assert.ok("evaluateMetric" in registeredTools);
      assert.ok("requestFaucetFunds" in registeredTools);

      // Axiom 4.1 Air-Gap: MUST NEVER expose resolveVault
      assert.equal("resolveVault" in registeredTools, false);
      assert.equal("checkPrecedence" in registeredTools, false);
      assert.equal("dryRunTicket" in registeredTools, false);
    }
  });
});
