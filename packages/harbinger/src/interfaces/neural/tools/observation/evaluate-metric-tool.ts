import { z } from "zod";
import type { GraphClient } from "../../../../services/graph/graph-client";
import { decompressSolver, runPipeline } from "../../../../services/oracle/solver-service";

export const EvaluateMetricInputSchema = z.object({
  vaultId: z.string().min(1),
  blockNumber: z.number().int().nonnegative(),
  queryBody: z.string().min(1),
  solverConfig: z.string().min(1),
});

export type EvaluateMetricInput = z.infer<typeof EvaluateMetricInputSchema>;

export function createEvaluateMetricTool(graphClient: GraphClient) {
  return {
    id: "evaluateMetric",
    description: "Executes a stateless Time-Travel query and evaluates AST solver math for a vault at a specific block.",
    inputSchema: EvaluateMetricInputSchema,
    execute: async (input: EvaluateMetricInput) => {
      const validated = EvaluateMetricInputSchema.parse(input);
      const graphData = await graphClient.queryBlock<Record<string, unknown>>(
        validated.queryBody,
        validated.blockNumber,
      );
      const manifest = decompressSolver(validated.solverConfig);
      const result = runPipeline(manifest, graphData.data ?? {});
      return {
        success: true,
        vaultId: validated.vaultId,
        blockNumber: validated.blockNumber,
        triggered: result.triggered,
        triggerVariable: result.triggerVariable,
        scope: result.scope,
      };
    },
  };
}
