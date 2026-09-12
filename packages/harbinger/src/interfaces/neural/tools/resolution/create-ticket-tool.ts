import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { buildReplayTicket } from "../../../../services/oracle/attestation-service";
import { decompressSolver } from "../../../../services/oracle/solver-service";
import { evaluatePrecedence } from "../../../../services/oracle/precedence-service";

export const CreateTicketInputSchema = z.object({
  vaultId: z.string().min(1),
  solverConfig: z.string().min(1),
  breachBlock: z.number().int().nonnegative(),
  snapshots: z.array(
    z.object({
      blockNumber: z.number().int().nonnegative(),
      inputs: z.record(z.string(), z.unknown()),
      intermediate: z.record(z.string(), z.unknown()),
      trigger: z.boolean(),
    }),
  ).min(1),
});

export type CreateTicketInput = z.infer<typeof CreateTicketInputSchema>;

export function createCreateTicketTool() {
  return createTool({
    id: "dryRunTicket",
    description: "Dry-run builds a Replay Ticket JSON for audit inspection without submitting on-chain.",
    inputSchema: CreateTicketInputSchema,
    execute: async (args: any) => {
      const input = (args && typeof args === "object" && "context" in args && args.context) ? args.context : args;
      const validated = CreateTicketInputSchema.parse(input);
      const manifest = decompressSolver(validated.solverConfig);
      const precedenceProof = evaluatePrecedence({
        breachBlock: validated.breachBlock,
        startBlock: manifest.timeBounds?.startBlock ?? 0,
        deadlineBlock: manifest.timeBounds?.deadlineBlock ?? validated.breachBlock + 10_000,
        consecutiveBreachBlocks: validated.snapshots.length,
        requiredDebounce: 2,
      });
      const ticket = buildReplayTicket({
        vaultId: validated.vaultId,
        manifest,
        precedenceProof,
        blockSnapshots: validated.snapshots,
        queryTemplate: manifest.query ?? "",
      });
      return { success: true, ticket };
    },
  });
}
