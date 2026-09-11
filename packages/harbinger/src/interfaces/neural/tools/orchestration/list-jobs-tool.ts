import { z } from "zod";
import type { LoopService } from "../../../../services/loop/loop-service";

export const ListJobsInputSchema = z.object({}).optional();

export function createListJobsTool(loopService: LoopService) {
  return {
    id: "listJobs",
    description: "Lists all active monitoring jobs currently registered in the SQLite active_jobs table.",
    inputSchema: z.object({}).optional(),
    execute: async (_input?: Record<string, unknown>) => {
      const jobs = await loopService.listJobs();
      return {
        success: true,
        count: jobs.length,
        jobs: jobs.map((j) => ({
          id: j.id,
          vaultId: j.vaultId,
          cadenceMs: j.cadenceMs,
          status: j.status,
          consecutiveBreaches: j.consecutiveBreaches,
          lastTickBlock: j.lastTickBlock,
        })),
      };
    },
  };
}
