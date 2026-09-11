export type JobStatus = "idle" | "running" | "paused" | "stopped";

export interface Job {
  id: string; // e.g. "job-whale-0x7a"
  vaultId: string;
  cadenceMs: number;
  status: JobStatus;
  lastTickBlock?: number;
  consecutiveBreaches: number;
  createdAt: number;
  updatedAt: number;
}
