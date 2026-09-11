import type { Server } from "node:http";
import type { Kysely } from "kysely";
import { loadConfig, type HarbingerConfig } from "@/config";
import {
  getDatabase,
  closeDatabase,
} from "@/infrastructure/database/connection";
import {
  getActiveJobs,
  upsertJob,
  recordHealthSnapshot,
  type HarbingerDB,
} from "@/infrastructure/database/schema";
import { CronScheduler, cronScheduler } from "@/infrastructure/cron/scheduler";
import { LoopRunner } from "@/infrastructure/cron/loop-runner";
import { GraphClient } from "@/services/graph/graph-client";
import { freshnessService } from "@/services/graph/freshness-service";
import { ChainClientService } from "@/services/chain/client-service";
import { TensionCastService } from "@/services/tension-cast/tension-cast-service";
import { LoopService } from "@/services/loop/loop-service";
import { JournalService } from "@/services/journal/journal-service";
import { createNeuralAgent } from "@/interfaces/neural/index";
import { WebSocketStreamServer } from "@/interfaces/ws/server";
import type { ReplayTicket } from "@/models/ReplayTicket";

export interface HarbingerHarness {
  config: HarbingerConfig;
  db: Kysely<HarbingerDB>;
  graphClient: GraphClient;
  chainClient: ChainClientService;
  tensionCastService: TensionCastService;
  loopService: LoopService;
  journalService: JournalService;
  neuralAgent: ReturnType<typeof createNeuralAgent>;
  wsServer: WebSocketStreamServer;
  scheduler: CronScheduler;
  runner: LoopRunner;
  isReady: boolean;
  stop: () => Promise<void>;
}

export interface DaemonState {
  isReady: boolean;
  config: HarbingerConfig;
  db: Kysely<HarbingerDB>;
  activeJobCount: number;
}

let activeHarness: HarbingerHarness | null = null;
let macroScanTimer: NodeJS.Timeout | null = null;
let signalTrapsRegistered = false;
let errorTrapsRegistered = false;

function setupErrorTraps(journalService: JournalService): void {
  if (errorTrapsRegistered) return;
  errorTrapsRegistered = true;

  process.on("uncaughtException", (err) => {
    journalService
      .recordThought({
        level: "ALERT",
        type: "SYSTEM_LIFECYCLE",
        source: "daemon",
        thought: `Uncaught exception in daemon runtime: ${err instanceof Error ? err.message : String(err)}`,
        confidenceScore: 1.0,
        metadata: {
          error: String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
      })
      .catch(() => {});
  });

  process.on("unhandledRejection", (reason) => {
    journalService
      .recordThought({
        level: "ALERT",
        type: "SYSTEM_LIFECYCLE",
        source: "daemon",
        thought: `Unhandled rejection in daemon runtime: ${reason instanceof Error ? reason.message : String(reason)}`,
        confidenceScore: 1.0,
        metadata: { reason: String(reason) },
      })
      .catch(() => {});
  });
}

function setupSignalTraps(): void {
  if (signalTrapsRegistered) return;
  signalTrapsRegistered = true;

  const cleanup = async () => {
    await shutdownHarbingerDaemon();
    process.exit(0);
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
}

export async function bootHarbingerDaemon(
  configOverrides: Partial<HarbingerConfig> = {},
  httpServer?: Server,
): Promise<HarbingerHarness> {
  if (activeHarness && activeHarness.isReady) {
    return activeHarness;
  }

  // 1. Config Validation (Zod)
  const config = loadConfig(configOverrides);

  // 2. Database Initialization (SQLite WAL mode via Kysely)
  const db = getDatabase(config.dbPath);

  // 3. Mount Core Services
  const journalService = new JournalService(db);
  const graphClient = new GraphClient(config.subgraphUrl);
  const chainClient = new ChainClientService(config, journalService);
  const tensionCastService = new TensionCastService(chainClient, db, {
    marketRegistry: config.marketRegistryAddress,
    vaultDriver: config.vaultDriverAddress,
  });

  // 4. Instantiate LoopRunner & Wire Settlement Bridge Callback
  const runner = new LoopRunner(
    db,
    graphClient,
    freshnessService,
    journalService,
    cronScheduler,
    {
      onBreachConfirmed: async (event: {
        jobId: string;
        vaultId: string;
        replayTicket: ReplayTicket;
      }) => {
        if (config.vaultDriverAddress) {
          await chainClient.resolveVault(
            config.vaultDriverAddress as `0x${string}`,
            event.vaultId,
            "Yes",
            event.replayTicket,
          );
        }
      },
    },
  );

  const loopService = new LoopService(
    db,
    cronScheduler,
    runner,
    journalService,
  );
  const neuralAgent = createNeuralAgent(
    journalService,
    loopService,
    graphClient,
  );
  const wsServer = new WebSocketStreamServer(journalService, config.wsPort);

  // 5. Start Outbound WebSocket Stream Server
  await wsServer.start(httpServer);

  // 6. Rehydrate Active Jobs
  const activeJobs = await getActiveJobs(db);
  for (const job of activeJobs) {
    if (job.status === "running") {
      job.status = "idle";
      job.updatedAt = Date.now();
      await upsertJob(db, job);
    }
  }

  // 7. Initial Health Snapshot and Macro Perception Loop (Axiom 6.2)
  const currentBlock = await chainClient.getBlockNumber().catch(() => 0);
  await recordHealthSnapshot(db, {
    timestamp: Date.now(),
    activeJobsCount: activeJobs.length,
    blockHeight: currentBlock,
    status: "HEALTHY",
  }).catch(() => {});

  const macroInterval = config.macroCadenceMs ?? 60_000;
  macroScanTimer = setInterval(async () => {
    try {
      const block = await chainClient.getBlockNumber().catch(() => 0);
      const jobs = await loopService.listJobs();

      await recordHealthSnapshot(db, {
        timestamp: Date.now(),
        activeJobsCount: jobs.length,
        blockHeight: block,
        status: "HEALTHY",
      });
    } catch {
      // Background supervisor catch
    }
  }, macroInterval);

  // 8. Error and Signal Traps (Axioms 6.1 & 6.4)
  setupErrorTraps(journalService);
  setupSignalTraps();

  // 9. Log Boot Thought
  await journalService.recordThought({
    level: "INFO",
    type: "SYSTEM_LIFECYCLE",
    source: "daemon",
    thought: `Harbinger daemon initialized on chain ${config.chainId}. Outbound WebSocket listening on port ${config.wsPort}. Rehydrated ${activeJobs.length} active monitoring jobs.`,
    confidenceScore: 1.0,
    metadata: {
      chainId: config.chainId,
      wsPort: config.wsPort,
      dbPath: config.dbPath,
      activeJobCount: activeJobs.length,
    },
  });

  activeHarness = {
    config,
    db,
    graphClient,
    chainClient,
    tensionCastService,
    loopService,
    journalService,
    neuralAgent,
    wsServer,
    scheduler: cronScheduler,
    runner,
    isReady: true,
    stop: shutdownHarbingerDaemon,
  };

  return activeHarness;
}

export async function shutdownHarbingerDaemon(): Promise<void> {
  if (!activeHarness) return;

  const harness = activeHarness;
  activeHarness = null;

  // 1. Clear macro timer and all scheduler intervals
  if (macroScanTimer) {
    clearInterval(macroScanTimer);
    macroScanTimer = null;
  }
  harness.scheduler.clearAll();

  // 2. Abort pending neural cycles (Axiom 6.1)
  if (
    harness.neuralAgent &&
    typeof harness.neuralAgent.abortAll === "function"
  ) {
    harness.neuralAgent.abortAll();
  }

  // 3. Stop WebSocket Server (sends code 1001 and terminates)
  await harness.wsServer.stop();

  // 4. Log clean shutdown thought
  try {
    await harness.journalService.recordThought({
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "daemon",
      thought:
        "Harbinger daemon shutting down cleanly. Releasing database locks.",
      confidenceScore: 1.0,
    });
  } catch {
    // Database may already be closing
  }

  // 5. Close database connection with WAL checkpoint (Axiom 6.1)
  await closeDatabase();
}

export function getActiveHarness(): HarbingerHarness | null {
  return activeHarness;
}

// Backwards-compatibility adaptors for Wave 1 test suite
export async function initHarbinger(
  configOverrides: Partial<HarbingerConfig> = {},
): Promise<DaemonState> {
  const harness = await bootHarbingerDaemon(configOverrides);
  const activeJobs = await getActiveJobs(harness.db);
  return {
    isReady: harness.isReady,
    config: harness.config,
    db: harness.db,
    activeJobCount: activeJobs.length,
  };
}

export async function shutdownHarbinger(): Promise<void> {
  await shutdownHarbingerDaemon();
}

export function getDaemonState(): DaemonState | null {
  if (!activeHarness) return null;
  return {
    isReady: activeHarness.isReady,
    config: activeHarness.config,
    db: activeHarness.db,
    activeJobCount: 0,
  };
}
