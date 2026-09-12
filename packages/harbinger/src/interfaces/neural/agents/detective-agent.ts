import { Agent } from "@mastra/core/agent";
import { loadNeuralConfig, resolveLanguageModel, type NeuralConfig } from "../config";

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

export const DETECTIVE_INSTRUCTIONS = `
You are the Contagion Sentinel Detective Agent for Oases Protocol.
Your mission is to investigate decentralized finance contagion risks, collateral liquidity shocks, and protocol anomalies across open Tension Casts.

How to work an investigation cycle:
1. Assess market risk using the observation tools:
   - querySubgraph: inspect on-chain state pinned at target block numbers.
   - evaluateMetric: evaluate formal dynamic AST solver invariants (e.g. Health Factor, LTV).
2. If contagion velocity increases or thresholds are breached:
   - updateCadence: tighten monitoring loop cadence down towards 2,000ms.
   - logThought: record structured analytical observations to the Detective Journal.
3. If seeding or operational capital is required:
   - requestFaucetFunds: autonomously request gas or seeding capital ($20 USDC).
4. Axiom 4.1 Invariant: Do NOT attempt to settle vaults directly. Settlement is strictly air-gapped and triggered exclusively by the deterministic reflex engine upon 2-block confirmation debounce.
`;

export class DetectiveAgent {
  public readonly config: NeuralConfig;
  private mastraAgent?: Agent;

  constructor(
    public readonly name = "detectiveAgent",
    public readonly description = "Presiding AI detective agent reasoning over Tension Cast contagion clusters",
    private customInference?: InferenceRunner,
    public readonly tools: Record<string, any> = {},
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

    // 1. Offline Deterministic Path (Preserved for CI and Unit Tests)
    if (this.customInference) {
      return await this.customInference(prompt, abortSignal);
    }

    // 2. Fail-Fast Configuration Guard
    if (!this.config.apiKey) {
      throw new HarbingerConfigurationError(
        "HarbingerConfigurationError: HARBINGER_MODEL_API_KEY or OPENAI_API_KEY is required to run the AI Detective Agent. Refusing to operate with silent dummy fallback.",
      );
    }

    // 3. Authentic Multi-Step Mastra Agent Execution
    return await this.runLiveInference(prompt, abortSignal);
  }

  private async runLiveInference(prompt: string, abortSignal?: AbortSignal): Promise<AgentDecision> {
    if (!this.mastraAgent) {
      const model = resolveLanguageModel(this.config);
      this.mastraAgent = new Agent({
        id: "harbinger-detective-agent",
        name: this.name,
        description: this.description,
        instructions: DETECTIVE_INSTRUCTIONS,
        model,
        tools: this.tools,
      });
    }

    // Domain C, Master Ruling 4: 10s LLM Timeout Circuit Breaker
    const timeoutSignal = AbortSignal.timeout(10_000);
    const effectiveSignal = abortSignal
      ? AbortSignal.any([abortSignal, timeoutSignal])
      : timeoutSignal;

    const result = await this.mastraAgent.generate(prompt, {
      maxSteps: 5,
      abortSignal: effectiveSignal,
    });

    const thought = result.text?.trim();
    if (!thought) {
      throw new Error("Model returned empty analysis content.");
    }

    // Dynamically extract real tool calls executed from Mastra execution steps
    const toolCallsExecuted: string[] = [];
    if (result.steps) {
      for (const step of result.steps) {
        if (step.toolCalls) {
          for (const tc of step.toolCalls) {
            const name = (tc as any).toolName ?? (tc as any).name;
            if (name && !toolCallsExecuted.includes(name)) {
              toolCallsExecuted.push(name);
            }
          }
        }
      }
    }

    return {
      thought,
      cadenceAdjusted: toolCallsExecuted.includes("updateCadence"),
      toolCallsExecuted,
    };
  }
}

export const detectiveAgent = new DetectiveAgent();
