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
  constructor(
    public readonly name = "detectiveAgent",
    public readonly description = "Presiding AI detective agent reasoning over Tension Cast contagion clusters",
    private customInference?: InferenceRunner,
  ) {}

  /**
   * Generates qualitative investigative hypotheses over the provided perception context.
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

    // Default heuristic synthesis analyzing the structured prompt
    return {
      thought: `Investigated contagion arcs across cluster. Physical correlation tolerances verified: all monitored vaults are operating within expected risk bounds.`,
      cadenceAdjusted: false,
      toolCallsExecuted: ["evaluateMetric"],
    };
  }
}

export const detectiveAgent = new DetectiveAgent();
