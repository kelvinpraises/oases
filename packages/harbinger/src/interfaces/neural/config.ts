import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";

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
    modelName: process.env.HARBINGER_MODEL_NAME ?? process.env.MODEL_NAME_AT_ENDPOINT ?? "gpt-4o",
    provider: process.env.HARBINGER_MODEL_PROVIDER ?? "openai",
    apiKey: process.env.HARBINGER_MODEL_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.MODEL_API_KEY,
    apiBaseUrl: process.env.HARBINGER_MODEL_BASE_URL ?? process.env.API_BASE_URL,
    ...overrides,
  });
}

/**
 * Creates an AI SDK language model from NeuralConfig.
 * Fails fast if OpenAI-compatible endpoint lacks an API key.
 */
export function resolveLanguageModel(config: NeuralConfig) {
  const apiKey = config.apiKey?.trim();
  const baseURL = config.apiBaseUrl?.trim() || "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error(
      "Missing API key: HARBINGER_MODEL_API_KEY or OPENAI_API_KEY is required to initialize the neural model."
    );
  }

  const openaiProvider = createOpenAI({
    apiKey,
    baseURL,
  });

  return openaiProvider(config.modelName);
}
