import { z } from "zod";

export const NeuralConfigSchema = z.object({
  modelName: z.string().default("gpt-4o"),
  provider: z.enum(["openai", "ollama", "mastra"]).default("openai"),
  apiKey: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  timeoutMs: z.number().int().positive().default(30000),
  maxTokens: z.number().int().positive().default(1024),
});

export type NeuralConfig = z.infer<typeof NeuralConfigSchema>;

export function loadNeuralConfig(overrides?: Partial<NeuralConfig>): NeuralConfig {
  return NeuralConfigSchema.parse({
    modelName: process.env.HARBINGER_MODEL_NAME ?? "gpt-4o",
    provider: process.env.HARBINGER_MODEL_PROVIDER ?? "openai",
    apiKey: process.env.HARBINGER_MODEL_API_KEY ?? process.env.OPENAI_API_KEY,
    apiBaseUrl: process.env.HARBINGER_MODEL_BASE_URL,
    ...overrides,
  });
}
