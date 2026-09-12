import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LoopService } from "../../../../services/loop/loop-service";
import type { Job } from "../../../../models/Job";

export const SpawnJobInputSchema = z.object({
  id: z.string().min(1),
  vaultId: z.string().min(1),
  cadenceMs: z.number().int().min(1000).max(60000).default(10000),
  solverConfig: z.string().min(1),
  queryBody: z.string().min(1),
});

export type SpawnJobInput = z.infer<typeof SpawnJobInputSchema>;

export function createSpawnJobTool(loopService: LoopService) {
  return createTool({
    id: "spawnJob",
    description: "Spawns a new active monitoring loop for a child vault in SQLite and mounts it to the scheduler.",
    inputSchema: SpawnJobInputSchema,
    execute: async (args: any) => {
      const input = (args && typeof args === "object" && "context" in args && args.context) ? args.context : args;
      const validated = SpawnJobInputSchema.parse(input);
      const job: Job = {
        id: validated.id,
        vaultId: validated.vaultId,
        cadenceMs: validated.cadenceMs,
        status: "idle",
        consecutiveBreaches: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const spawned = await loopService.spawnJob(
        job,
        validated.solverConfig,
        validated.queryBody,
      );
      return { success: true, job: spawned };
    },
  });
}
