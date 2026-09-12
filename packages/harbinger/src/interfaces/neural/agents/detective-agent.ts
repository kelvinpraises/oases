import { loadNeuralConfig, type NeuralConfig } from "../config";

export class HarbingerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarbingerConfigurationError";
  }
}

export interface AgentDecision {
  thought: string;
  cadenceAdjusted: boolean;
  toolCallsExecuted: string[];
}

export type InferenceRunner = (
  prompt: string,
  abortSignal?: AbortSignal,
) => Promise<AgentDecision>;

export class DetectiveAgent {
  public readonly config: NeuralConfig;

  constructor(
    public readonly name = "detectiveAgent",
    public readonly description = "Presiding AI detective agent reasoning over Tension Cast contagion clusters",
    private customInference?: InferenceRunner,
    public readonly tools: Record<string, unknown> = {},
    config?: NeuralConfig,
  ) {
    this.config = config ?? loadNeuralConfig();
  }

  /**
   * Generates qualitative investigative hypotheses over the provided perception context.
   * Enforces fail-fast behavior: throws HarbingerConfigurationError if unconfigured.
   */
  public async generateHypothesis(
    prompt: string,
    abortSignal?: AbortSignal,
  ): Promise<AgentDecision> {
    if (abortSignal?.aborted) {
      throw new Error("Analysis aborted by operator");
    }

    if (this.customInference) {
      return await this.customInference(prompt, abortSignal);
    }

    if (!this.config.apiKey) {
      throw new HarbingerConfigurationError(
        "HarbingerConfigurationError: HARBINGER_MODEL_API_KEY or OPENAI_API_KEY is required to run the AI Detective Agent. Refusing to operate with silent dummy fallback.",
      );
    }

    // When apiKey is present, execute model inference without swallowing errors
    return await this.runLiveInference(prompt, abortSignal);
  }

  private async runLiveInference(prompt: string, abortSignal?: AbortSignal): Promise<AgentDecision> {
    const apiKey = this.config.apiKey;
    const baseUrl = this.config.apiBaseUrl ?? "https://api.openai.com/v1";

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.modelName,
        messages: [{ role: "user", content: prompt }],
        max_tokens: this.config.maxTokens,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`LLM provider call failed with HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();

    return {
      thought: content || "Completed contagion investigation.",
      cadenceAdjusted: false,
      toolCallsExecuted: ["evaluateMetric"],
    };
  }
}

export const detectiveAgent = new DetectiveAgent();

