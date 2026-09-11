export type CronTickHandler = () => Promise<unknown> | unknown;

export class CronScheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private cadences: Map<string, number> = new Map();

  /**
   * Schedules a recurring tick execution for a job at the designated cadence.
   */
  public registerJob(jobId: string, cadenceMs: number, onTick: CronTickHandler): void {
    this.unregisterJob(jobId);

    this.cadences.set(jobId, cadenceMs);
    const timer = setInterval(async () => {
      try {
        await onTick();
      } catch (err) {
        // Safe catch to ensure background loop timer survives unexpected runtime errors
        console.error(`[CronScheduler] Error during tick for job ${jobId}:`, err);
      }
    }, cadenceMs);

    this.timers.set(jobId, timer);
  }

  /**
   * Reschedules an active job with a new monitoring cadence.
   */
  public updateCadence(jobId: string, newCadenceMs: number, onTick: CronTickHandler): void {
    if (!this.timers.has(jobId)) {
      throw new Error(`Cannot update cadence: job ${jobId} is not scheduled`);
    }
    this.registerJob(jobId, newCadenceMs, onTick);
  }

  /**
   * Unregisters and clears the active timer for a job.
   */
  public unregisterJob(jobId: string): void {
    const existing = this.timers.get(jobId);
    if (existing) {
      clearInterval(existing);
      this.timers.delete(jobId);
      this.cadences.delete(jobId);
    }
  }

  public getCadence(jobId: string): number | undefined {
    return this.cadences.get(jobId);
  }

  public isScheduled(jobId: string): boolean {
    return this.timers.has(jobId);
  }

  public clearAll(): void {
    for (const [, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.cadences.clear();
  }
}

export const cronScheduler = new CronScheduler();
