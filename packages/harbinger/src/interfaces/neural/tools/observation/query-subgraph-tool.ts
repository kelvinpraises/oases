import { z } from "zod";
import type { GraphClient } from "../../../../services/graph/graph-client";

export const QuerySubgraphInputSchema = z.object({
  query: z.string().min(1, "query is required"),
  targetBlock: z.number().int().nonnegative("targetBlock must be non-negative"),
});

export type QuerySubgraphInput = z.infer<typeof QuerySubgraphInputSchema>;

export function createQuerySubgraphTool(graphClient: GraphClient) {
  return {
    id: "querySubgraph",
    description: "Executes a stateless Time-Travel query against The Graph pinned at targetBlock.",
    inputSchema: QuerySubgraphInputSchema,
    execute: async (input: QuerySubgraphInput) => {
      const validated = QuerySubgraphInputSchema.parse(input);
      const res = await graphClient.queryBlock<Record<string, unknown>>(
        validated.query,
        validated.targetBlock,
      );
      return {
        success: true,
        indexerBlock: res.indexerBlock,
        data: res.data,
      };
    },
  };
}
