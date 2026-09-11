import { z } from "zod";
import type { LoopService } from "../../../../services/loop/loop-service";

export const KillJobInputSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
});

export type KillJobInput = z.infer<typeof KillJobInputSchema>;

export function createKillJobTool(loopService: LoopService) {
  return {
    id: "killJob",
    description: "Terminates an active monitoring job and unregisters its timer from the reflex loop scheduler.",
    inputSchema: KillJobInputSchema,
    execute: async (input: KillJobInput) => {
      const validated = KillJobInputSchema.parse(input);
      await loopService.killJob(validated.jobId);
      return { success: true, jobId: validated.jobId };
    },
  };
}
