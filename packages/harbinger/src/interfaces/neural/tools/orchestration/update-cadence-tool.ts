import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { LoopService } from "../../../../services/loop/loop-service";

export const UpdateCadenceInputSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
  newCadenceMs: z
    .number()
    .int()
    .min(1000, "Cadence cannot be lower than 1,000ms (Axiom 4.4)")
    .max(60000, "Cadence cannot exceed 60,000ms (Axiom 4.4)"),
  reason: z.string().min(1, "reason is required"),
  solverConfig: z.string().min(1, "solverConfig is required"),
  queryBody: z.string().min(1, "queryBody is required"),
});

export type UpdateCadenceInput = z.infer<typeof UpdateCadenceInputSchema>;

export function createUpdateCadenceTool(loopService: LoopService) {
  return createTool({
    id: "updateCadence",
    description: "Adjusts the monitoring cadence of an active child vault job (bounded between 1,000ms and 60,000ms).",
    inputSchema: UpdateCadenceInputSchema,
    execute: async (args: any) => {
      const input = (args && typeof args === "object" && "context" in args && args.context) ? args.context : args;
      const validated = UpdateCadenceInputSchema.parse(input);
      await loopService.updateCadence(
        validated.jobId,
        validated.newCadenceMs,
        validated.solverConfig,
        validated.queryBody,
      );
      return {
        success: true,
        jobId: validated.jobId,
        cadenceMs: validated.newCadenceMs,
        reason: validated.reason,
      };
    },
  });
}
