import type { Kysely } from "kysely";
import type { HarbingerDB } from "../../infrastructure/database/schema";
import {
  getActiveJobs,
  getJobById,
  upsertJob,
} from "../../infrastructure/database/schema";
import type { Job } from "../../models/Job";
import type { CronScheduler } from "../../infrastructure/cron/scheduler";
import type { LoopRunner } from "../../infrastructure/cron/loop-runner";
import type { JournalService } from "../journal/journal-service";

export class LoopService {
  constructor(
    private db: Kysely<HarbingerDB>,
    private scheduler: CronScheduler,
    private runner: LoopRunner,
    private journal: JournalService,
  ) {}

  /**
   * Spawns a new active monitoring job in SQLite and registers it with the cron scheduler.
   */
  public async spawnJob(
    job: Job,
    solverConfig: string,
    queryBody: string,
  ): Promise<Job> {
    const existing = await getJobById(this.db, job.id);
    if (existing && existing.status === "running") {
      return existing;
    }

    job.status = "running";
    job.updatedAt = Date.now();
    await upsertJob(this.db, job);

    this.scheduler.registerJob(job.id, job.cadenceMs, async () => {
      await this.runner.executeTick(job, solverConfig, queryBody);
    });

    await this.journal.recordThought({
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "loop_service",
      thought: `Spawned monitoring loop for ${job.vaultId} at ${job.cadenceMs}ms cadence.`,
      confidenceScore: 1.0,
      metadata: {
        jobId: job.id,
        vaultId: job.vaultId,
        cadenceMs: job.cadenceMs,
      },
    });

    return job;
  }

  /**
   * Stops and unregisters an active monitoring job.
   */
  public async killJob(jobId: string): Promise<void> {
    this.scheduler.unregisterJob(jobId);

    const job = await getJobById(this.db, jobId);
    if (job) {
      job.status = "stopped";
      job.updatedAt = Date.now();
      await upsertJob(this.db, job);
    }

    await this.journal.recordThought({
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "loop_service",
      thought: `Killed monitoring loop for job ${jobId}.`,
      confidenceScore: 1.0,
      metadata: { jobId },
    });
  }

  /**
   * Dynamically updates the cadence of a monitored job.
   */
  public async updateCadence(
    jobId: string,
    newCadenceMs: number,
    solverConfig: string,
    queryBody: string,
  ): Promise<void> {
    const job = await getJobById(this.db, jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found in database`);
    }

    job.cadenceMs = newCadenceMs;
    job.updatedAt = Date.now();
    await upsertJob(this.db, job);

    this.scheduler.updateCadence(jobId, newCadenceMs, async () => {
      await this.runner.executeTick(job, solverConfig, queryBody);
    });
  }

  /**
   * Retrieves all running monitoring jobs.
   */
  public async listJobs(): Promise<Job[]> {
    return await getActiveJobs(this.db);
  }

  /**
   * Retrieves a specific job by ID.
   */
  public async getJob(jobId: string): Promise<Job | undefined> {
    return await getJobById(this.db, jobId);
  }

  /**
   * Reaps stale monitoring jobs whose directive deadlines have passed.
   */
  public async reapStaleJobs(
    currentBlock: number,
    deadlineBlock: number,
  ): Promise<number> {
    if (currentBlock < deadlineBlock) return 0;

    const jobs = await this.listJobs();
    let reapedCount = 0;
    for (const job of jobs) {
      if (job.status !== "stopped") {
        await this.killJob(job.id);
        reapedCount++;
      }
    }
    return reapedCount;
  }
}
