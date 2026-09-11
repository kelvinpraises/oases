import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { bootHarbingerDaemon, shutdownHarbingerDaemon } from "@/daemon";
import type { SourceDirective } from "@/models/Directive";
import {
  compileAndCompressSolver,
  type SolverManifest,
} from "@/services/oracle/solver-service";

describe("Flow 6 — Master Harbinger Integration Test Suite", () => {
  let harness: Awaited<ReturnType<typeof bootHarbingerDaemon>>;

  before(async () => {
    harness = await bootHarbingerDaemon({
      dbPath: ":memory:",
      wsPort: 49152, // High ephemeral test port
      chainId: 31337,
    });
  });

  after(async () => {
    await shutdownHarbingerDaemon();
  });

  it("Step 1: Boots daemon with in-memory database and confirms readiness", () => {
    assert.equal(harness.isReady, true);
    assert.equal(harness.config.chainId, 31337);
  });

  it("Step 2: Primes an open set of N=4 child vaults across 4 physical classes", async () => {
    const manifest: SolverManifest = {
      version: "1.0",
      globals: { hf: "data.account.healthFactor" },
      tree: [
        { id: "s1", type: "expr", formula: "hf <= 1.0", output: "breach" },
      ],
      resolution: { triggerVariable: "breach" },
    };
    const { compiledConfig: dummySolver } = compileAndCompressSolver(manifest);

    const directive: SourceDirective = {
      marketId: "0xmarket_e2e_test",
      title: "Whale 0x7a Health Factor Contagion",
      streamId: "stream_e2e_test",
      creator: "0x1111111111111111111111111111111111111111",
      startBlock: 100,
      deadlineBlock: 500,
      childVaults: [
        {
          vaultId: "v-actor",
          marketId: "0xmarket_e2e_test",
          classType: "Actor",
          targetAddress: "0x7a",
          question: "Whale liquidated?",
          compiledSolverConfig: dummySolver,
        },
        {
          vaultId: "v-place",
          marketId: "0xmarket_e2e_test",
          classType: "Place",
          targetAddress: "0xAave",
          question: "Pool paused?",
          compiledSolverConfig: dummySolver,
        },
        {
          vaultId: "v-act",
          marketId: "0xmarket_e2e_test",
          classType: "Act",
          targetAddress: "0xFlash",
          question: "Arbitrage spike?",
          compiledSolverConfig: dummySolver,
        },
        {
          vaultId: "v-bond",
          marketId: "0xmarket_e2e_test",
          classType: "Bond",
          targetAddress: "0xDebt",
          question: "Bad debt accrued?",
          compiledSolverConfig: dummySolver,
        },
      ],
    };

    const genesisResult =
      await harness.tensionCastService.primeTensionCast(directive);
    assert.equal(genesisResult.primedVaults.length, 4);
    assert.equal(genesisResult.totalSeedCapital, 80n * 10n ** 18n); // 4 * $20 Wad = 80 Wad

    const activeJobs = await harness.loopService.listJobs();
    assert.equal(activeJobs.length, 4);
  });

  it("Step 3: Connects WebSocket client and receives initial backfill burst", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${harness.config.wsPort}`);

    const backfillReceived = await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WebSocket timeout")),
        3000,
      );
      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "INIT_BACKFILL") {
            clearTimeout(timer);
            ws.close();
            resolve(true);
          }
        } catch {
          // Non-JSON ignore
        }
      });
      ws.on("error", reject);
    });

    assert.equal(backfillReceived, true);
  });

  it("Step 4: Rejects inbound WebSocket messages with code 1008 (Axiom 4.3)", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${harness.config.wsPort}`);

    const closedWith1008 = await new Promise<boolean>((resolve) => {
      ws.on("open", () => {
        ws.send("ILLEGAL_MUTATION_ATTEMPT");
      });
      ws.on("close", (code) => {
        resolve(code === 1008);
      });
    });

    assert.equal(closedWith1008, true);
  });

  it("Step 5: Shuts down daemon cleanly, clearing all timers and releasing locks", async () => {
    await shutdownHarbingerDaemon();
    assert.equal(harness.scheduler.isScheduled("job-v-actor"), false);
  });
});
