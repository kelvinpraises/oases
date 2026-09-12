import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { evaluatePrecedence } from "../../../../services/oracle/precedence-service";

export const CheckPrecedenceInputSchema = z.object({
  breachBlock: z.number().int().nonnegative(),
  startBlock: z.number().int().nonnegative(),
  deadlineBlock: z.number().int().nonnegative(),
  consecutiveBreachBlocks: z.number().int().nonnegative(),
  abortTimestamp: z.number().nullable().optional(),
  requiredDebounce: z.number().int().positive().default(2),
});

export type CheckPrecedenceInput = z.infer<typeof CheckPrecedenceInputSchema>;

export function createCheckPrecedenceTool() {
  return createTool({
    id: "checkPrecedence",
    description: "Read-only evaluation of formal precedence state machine against time bounds and debounce count.",
    inputSchema: CheckPrecedenceInputSchema,
    execute: async (args: any) => {
      const input = (args && typeof args === "object" && "context" in args && args.context) ? args.context : args;
      const validated = CheckPrecedenceInputSchema.parse(input);
      const proof = evaluatePrecedence({
        breachBlock: validated.breachBlock,
        startBlock: validated.startBlock,
        deadlineBlock: validated.deadlineBlock,
        abortTimestamp: validated.abortTimestamp ?? null,
        consecutiveBreachBlocks: validated.consecutiveBreachBlocks,
        requiredDebounce: validated.requiredDebounce,
      });
      return { success: true, proof };
    },
  });
}
