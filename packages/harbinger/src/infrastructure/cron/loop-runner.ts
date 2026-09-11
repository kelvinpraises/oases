import type { Kysely } from "kysely";
import type { HarbingerDB } from "../database/schema";
import { upsertJob } from "../database/schema";
import type { Job } from "../../models/Job";
import type { GraphClient } from "../../services/graph/graph-client";
import type { FreshnessService } from "../../services/graph/freshness-service";
import { decompressSolver, runPipeline } from "../../services/oracle/solver-service";
import { evaluatePrecedence } from "../../services/oracle/precedence-service";
import { buildReplayTicket } from "../../services/oracle/attestation-service";
import type { BlockSnapshot, ReplayTicket } from "../../services/oracle/attestation-service";
import type { JournalService } from "../../services/journal/journal-service";
import type { CronScheduler } from "./scheduler";

export interface TickEvaluationResult {
  jobId: string;
  vaultId: string;
  blockNumber: number;
  conditionMet: boolean;
  metricValue: number;
  consecutiveBreaches: number;
  debounceConfirmed: boolean;
  replayTicket?: ReplayTicket;
  snapshot: BlockSnapshot;
  skipped?: boolean;
  expired?: boolean;
}

export interface LoopRunnerOptions {
  defaultCadenceMs?: number; // Default: 10_000 (10s)
  acceleratedCadenceMs?: number; // Default: 2_000 (2s)
  onBreachConfirmed?: (event: {
    jobId: string;
    vaultId: string;
    replayTicket: ReplayTicket;
  }) => Promise<void> | void;
}

export class LoopRunner {
  private busyJobs: Set<string> = new Set();
  private pendingSnapshots: Map<string, BlockSnapshot[]> = new Map();
  public readonly defaultCadenceMs: number;
  public readonly acceleratedCadenceMs: number;
  private onBreachConfirmed?: LoopRunnerOptions["onBreachConfirmed"];

  constructor(
    private db: Kysely<HarbingerDB>,
    private graphClient: GraphClient,
    private freshnessService: FreshnessService,
    private journalService: JournalService,
    private scheduler: CronScheduler,
    options?: LoopRunnerOptions,
  ) {
    this.defaultCadenceMs = options?.defaultCadenceMs ?? 10_000;
    this.acceleratedCadenceMs = options?.acceleratedCadenceMs ?? 2_000;
    this.onBreachConfirmed = options?.onBreachConfirmed;
  }

  /**
   * Executes a single evaluation tick for an enrolled child vault job.
   * Enforces:
   * 1. Skip-If-Busy Mutex (Axiom 3.2)
   * 2. Discrete Block Advancement Guard (No-op on same block)
   * 3. Dual-Layer Expiration Guard (Self-terminates past deadline)
   * 4. Stateless Time-Travel Graph Query (Axiom 2.1)
   * 5. Indexer Freshness Gate (Axiom 2.2)
   * 6. Strict Consecutive 2-Block Debounce (Axiom 3.1)
   * 7. Dynamic Cadence Hysteresis (Axiom 3.4)
   * 8. Forensic Immutability (Axiom 3.3)
   */
  public async executeTick(
    job: Job,
    solverConfig: string,
    queryBody: string,
  ): Promise<TickEvaluationResult | null> {
    // 1. Skip-If-Busy Mutex (Axiom 3.2)
    if (this.busyJobs.has(job.id)) {
      return null;
    }
    this.busyJobs.add(job.id);

    try {
      // 2. Fetch Latest Block from Subgraph
      const ping = await this.graphClient.queryBlock<{ _meta?: { block: { number: number } } }>(
        "{ _meta { block { number } } }",
        0,
      );
      const currentBlock = ping.indexerBlock;

      // 3. Discrete Block Advancement Guard
      // If block height hasn't advanced since last evaluated tick, treat as a no-op
      if (job.lastTickBlock !== undefined && currentBlock === job.lastTickBlock) {
        return {
          jobId: job.id,
          vaultId: job.vaultId,
          blockNumber: currentBlock,
          conditionMet: false,
          metricValue: 0,
          consecutiveBreaches: job.consecutiveBreaches,
          debounceConfirmed: false,
          snapshot: {
            blockNumber: currentBlock,
            inputs: {},
            intermediate: {},
            trigger: false,
          },
          skipped: true,
        };
      }

      // 4. Decompress Solver Manifest
      const manifest = decompressSolver(solverConfig);

      // 5. Dual-Layer Expiration Guard
      // Self-terminate job if current block exceeds directive deadline
      if (
        manifest.timeBounds?.deadlineBlock &&
        currentBlock > manifest.timeBounds.deadlineBlock
      ) {
        this.scheduler.unregisterJob(job.id);
        job.status = "stopped";
        job.updatedAt = Date.now();
        await upsertJob(this.db, job);

        await this.journalService.recordThought({
          level: "INFO",
          type: "SYSTEM_LIFECYCLE",
          source: "reflex_loop",
          thought: `Vault ${job.vaultId} deadline passed (${manifest.timeBounds.deadlineBlock} < ${currentBlock}). Self-terminating monitoring loop.`,
          confidenceScore: 1.0,
          metadata: {
            vaultId: job.vaultId,
            deadlineBlock: manifest.timeBounds.deadlineBlock,
            currentBlock,
          },
        });

        return {
          jobId: job.id,
          vaultId: job.vaultId,
          blockNumber: currentBlock,
          conditionMet: false,
          metricValue: 0,
          consecutiveBreaches: job.consecutiveBreaches,
          debounceConfirmed: false,
          snapshot: {
            blockNumber: currentBlock,
            inputs: {},
            intermediate: {},
            trigger: false,
          },
          expired: true,
        };
      }

      // 6. Query The Graph at currentBlock pinned & Evaluate Pipeline
      const graphData = await this.graphClient.queryBlock<Record<string, unknown>>(
        queryBody,
        currentBlock,
      );

      const pipelineResult = runPipeline(manifest, graphData.data ?? {});
      const conditionMet = Boolean(pipelineResult.triggered);
      const metricValue =
        typeof pipelineResult.scope[pipelineResult.triggerVariable] === "number"
          ? (pipelineResult.scope[pipelineResult.triggerVariable] as number)
          : conditionMet
            ? 1
            : 0;

      const snapshot: BlockSnapshot = {
        blockNumber: currentBlock,
        inputs: { ...pipelineResult.scope },
        intermediate: { ...pipelineResult.scope },
        trigger: conditionMet,
      };

      // 7. 2-Block Confirmation Debounce State Machine (Axiom 3.1)
      let snapshots = this.pendingSnapshots.get(job.id) ?? [];
      let consecutiveBreaches = job.consecutiveBreaches;
      let debounceConfirmed = false;
      let replayTicket: ReplayTicket | undefined;

      if (conditionMet) {
        if (consecutiveBreaches === 0) {
          // Breach 1
          consecutiveBreaches = 1;
          snapshots = [snapshot];
        } else if (
          job.lastTickBlock !== undefined &&
          currentBlock === job.lastTickBlock + 1
        ) {
          // Strictly consecutive breach (Breach 2)
          consecutiveBreaches += 1;

          // Stateless Time-Travel Backfill if daemon restarted mid-debounce
          if (snapshots.length === 0) {
            try {
              const priorData = await this.graphClient.queryBlock<Record<string, unknown>>(
                queryBody,
                job.lastTickBlock,
              );
              const priorResult = runPipeline(manifest, priorData.data ?? {});
              const priorSnapshot: BlockSnapshot = {
                blockNumber: job.lastTickBlock,
                inputs: { ...priorResult.scope },
                intermediate: { ...priorResult.scope },
                trigger: priorResult.triggered,
              };
              snapshots = [priorSnapshot];
            } catch {
              snapshots = [];
            }
          }

          snapshots.push(snapshot);

          if (consecutiveBreaches >= 2) {
            debounceConfirmed = true;
            const precedenceProof = evaluatePrecedence({
              breachBlock: currentBlock,
              startBlock: manifest.timeBounds?.startBlock ?? 0,
              deadlineBlock:
                manifest.timeBounds?.deadlineBlock ?? currentBlock + 10_000,
              consecutiveBreachBlocks: consecutiveBreaches,
              requiredDebounce: 2,
            });

            replayTicket = buildReplayTicket({
              vaultId: job.vaultId,
              manifest,
              precedenceProof,
              blockSnapshots: snapshots.slice(-2),
              queryTemplate: queryBody,
            });
          }
        } else {
          // Non-consecutive breach (gap > 1 block): reset counter to 1
          consecutiveBreaches = 1;
          snapshots = [snapshot];

          await this.journalService.recordThought({
            level: "ALERT",
            type: "DEVIATION_ANALYSIS",
            source: "reflex_loop",
            thought: `Non-consecutive breach gap detected for ${job.vaultId} (prior: ${job.lastTickBlock}, current: ${currentBlock}). Debounce reset to 1.`,
            confidenceScore: 0.9,
            metadata: {
              vaultId: job.vaultId,
              priorBlock: job.lastTickBlock,
              currentBlock,
            },
          });
        }
      } else {
        // Condition calm: reset debounce counter
        consecutiveBreaches = 0;
        snapshots = [];
      }

      this.pendingSnapshots.set(job.id, snapshots);

      // 8. Persist Updated Job State to SQLite via Kysely (Axiom 3.3)
      job.consecutiveBreaches = consecutiveBreaches;
      job.lastTickBlock = currentBlock;
      job.updatedAt = Date.now();
      await upsertJob(this.db, job);

      // 9. Dynamic Cadence Hysteresis (Axiom 3.4)
      if (conditionMet && job.cadenceMs !== this.acceleratedCadenceMs) {
        job.cadenceMs = this.acceleratedCadenceMs;
        if (this.scheduler.isScheduled(job.id)) {
          this.scheduler.updateCadence(job.id, this.acceleratedCadenceMs, async () => {
            await this.executeTick(job, solverConfig, queryBody);
          });
        }
        await this.journalService.recordThought({
          level: "ALERT",
          type: "CADENCE_DECISION",
          source: "reflex_loop",
          thought: `Accelerated monitoring cadence to ${this.acceleratedCadenceMs}ms for ${job.vaultId} due to active breach condition.`,
          confidenceScore: 0.95,
          metadata: {
            vaultId: job.vaultId,
            cadenceMs: this.acceleratedCadenceMs,
            block: currentBlock,
          },
        });
      } else if (
        !conditionMet &&
        consecutiveBreaches === 0 &&
        job.cadenceMs !== this.defaultCadenceMs
      ) {
        job.cadenceMs = this.defaultCadenceMs;
        if (this.scheduler.isScheduled(job.id)) {
          this.scheduler.updateCadence(job.id, this.defaultCadenceMs, async () => {
            await this.executeTick(job, solverConfig, queryBody);
          });
        }
        await this.journalService.recordThought({
          level: "INFO",
          type: "CADENCE_DECISION",
          source: "reflex_loop",
          thought: `Relaxed monitoring cadence to ${this.defaultCadenceMs}ms for ${job.vaultId}. Metric calm.`,
          confidenceScore: 0.9,
          metadata: {
            vaultId: job.vaultId,
            cadenceMs: this.defaultCadenceMs,
            block: currentBlock,
          },
        });
      }

      // 10. Handle Breach Confirmation
      if (debounceConfirmed && replayTicket) {
        await this.journalService.recordThought({
          level: "RESOLUTION",
          type: "RESOLUTION_VERDICT",
          source: "reflex_loop",
          thought: `2-Block Confirmation verified for ${job.vaultId} at blocks ${currentBlock - 1} and ${currentBlock}. Replay Ticket constructed.`,
          confidenceScore: 1.0,
          metadata: { vaultId: job.vaultId, replayTicket },
        });

        if (this.onBreachConfirmed) {
          await this.onBreachConfirmed({
            jobId: job.id,
            vaultId: job.vaultId,
            replayTicket,
          });
        }
      }

      return {
        jobId: job.id,
        vaultId: job.vaultId,
        blockNumber: currentBlock,
        conditionMet,
        metricValue,
        consecutiveBreaches,
        debounceConfirmed,
        replayTicket,
        snapshot,
      };
    } catch (err) {
      // Record warning to Thought Journal while preserving debounce state on transient network/indexer errors
      await this.journalService.recordThought({
        level: "ALERT",
        type: "DEVIATION_ANALYSIS",
        source: "reflex_loop",
        thought: `Transient query error during evaluation tick for ${job.vaultId}: ${(err as Error).message}. Preserving debounce state.`,
        confidenceScore: 0.8,
        metadata: {
          vaultId: job.vaultId,
          error: (err as Error).message,
        },
      });
      return null;
    } finally {
      this.busyJobs.delete(job.id);
    }
  }

  public getPendingSnapshots(jobId: string): BlockSnapshot[] {
    return [...(this.pendingSnapshots.get(jobId) ?? [])];
  }

  public clearPendingSnapshots(jobId: string): void {
    this.pendingSnapshots.delete(jobId);
  }
}
