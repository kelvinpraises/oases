import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { JournalService } from "../../../../services/journal/journal-service";

export const LogThoughtInputSchema = z.object({
  level: z.enum(["INFO", "ANOMALY", "ALERT"]),
  thought: z.string().min(5, "Thought must be at least 5 characters"),
  confidenceScore: z.number().min(0.0).max(1.0),
  relatedVaultId: z.string().optional(),
});

export type LogThoughtInput = z.infer<typeof LogThoughtInputSchema>;

export function createLogThoughtTool(journalService: JournalService) {
  return createTool({
    id: "logThought",
    description: "Logs a qualitative detective hypothesis or risk analysis to the Detective Thought Journal.",
    inputSchema: LogThoughtInputSchema,
    execute: async (args: any) => {
      const input = (args && typeof args === "object" && "context" in args && args.context) ? args.context : args;
      const validated = LogThoughtInputSchema.parse(input);
      const entry = await journalService.recordThought({
        level: validated.level,
        type: "CONTAGION_ANALYSIS",
        source: "detective_agent",
        thought: validated.thought,
        confidenceScore: validated.confidenceScore,
        metadata: validated.relatedVaultId ? { relatedVaultId: validated.relatedVaultId } : undefined,
      });
      return { success: true, entryId: entry.id };
    },
  });
}
