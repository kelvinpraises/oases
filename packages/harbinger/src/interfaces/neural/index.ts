import { detectiveAgent, DetectiveAgent } from "./agents/detective-agent";
import { renderSystemPrompt, type PerceptionContext } from "./render-context";
import type { JournalService } from "../../services/journal/journal-service";
import type { LoopService } from "../../services/loop/loop-service";
import type { GraphClient } from "../../services/graph/graph-client";

export * from "./config";
export * from "./render-context";
export * from "./tool-authorization";
export * from "./agents/detective-agent";
export * from "./tools/index";

export interface ObservationItem {
  block: number;
  note: string;
  metricValue?: number;
}

export interface NeuralAgentInstance {
  runAnalysis(context: PerceptionContext): Promise<void>;
  handleObservationTrigger(
    marketId: string,
    observation: ObservationItem,
    context: PerceptionContext,
  ): Promise<void>;
  interruptAnalysis(marketId: string): boolean;
  abortAll(): void;
  respondToUser(marketId: string, userMessage: string): Promise<string>;
  getMailboxPendingCount(marketId: string): number;
  isAnalyzing(marketId: string): boolean;
}

/**
 * Creates the presiding Neural Cognitive Agent instance.
 * Enforces:
 * 1. Air-Gapped Settlement Invariant (Axiom 4.1)
 * 2. Coalesced Observation Mailbox / Trailing-Edge Ingestion (Axiom 4.7)
 */
export function createNeuralAgent(
  journalService: JournalService,
  loopService: LoopService,
  graphClient?: GraphClient,
  agent: DetectiveAgent = detectiveAgent,
): NeuralAgentInstance {
  const runningAnalyses = new Map<string, AbortController>();
  const isBusy = new Map<string, boolean>();
  const mailbox = new Map<string, ObservationItem[]>();

  async function executeAnalysisCycle(
    context: PerceptionContext,
    accumulatedObservations: ObservationItem[],
  ): Promise<void> {
    const marketId = context.directive.marketId;
    const abortController = new AbortController();
    runningAnalyses.set(marketId, abortController);

    try {
      const promptCtx: PerceptionContext = {
        ...context,
        accumulatedObservations,
      };
      const systemPrompt = renderSystemPrompt(promptCtx);

      const decision = await agent.generateHypothesis(
        systemPrompt,
        abortController.signal,
      );

      await journalService.recordThought({
        level: "INFO",
        type: "CLUSTER_SYNTHESIS",
        source: "detective_agent",
        thought: decision.thought,
        confidenceScore: 0.9,
        metadata: {
          marketId,
          toolCalls: decision.toolCallsExecuted,
          coalescedObservationsCount: accumulatedObservations.length,
        },
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"))
      ) {
        return;
      }
      await journalService.recordThought({
        level: "ALERT",
        type: "SYSTEM_LIFECYCLE",
        source: "detective_agent",
        thought: `Agent analysis cycle failed: ${err instanceof Error ? err.message : String(err)}`,
        confidenceScore: 0.5,
        metadata: {
          marketId,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    } finally {
      runningAnalyses.delete(marketId);
    }
  }

  async function processMailboxLoop(context: PerceptionContext): Promise<void> {
    const marketId = context.directive.marketId;
    if (isBusy.get(marketId)) {
      return;
    }
    isBusy.set(marketId, true);

    try {
      while (true) {
        const queue = mailbox.get(marketId) ?? [];
        if (queue.length === 0) {
          break;
        }
        // Drain mailbox
        const drained = [...queue];
        mailbox.set(marketId, []);

        await executeAnalysisCycle(context, drained);
      }
    } finally {
      isBusy.delete(marketId);
    }
  }

  return {
    async runAnalysis(context: PerceptionContext): Promise<void> {
      const marketId = context.directive.marketId;
      if (isBusy.get(marketId)) {
        // Enqueue an observation marker into the mailbox rather than dropping
        const queue = mailbox.get(marketId) ?? [];
        queue.push({
          block: 0,
          note: "Macro periodic review triggered while prior cycle in-flight",
        });
        mailbox.set(marketId, queue);
        return;
      }
      isBusy.set(marketId, true);
      try {
        await executeAnalysisCycle(context, []);
        // Drain any mailbox items that accumulated during execution
        while (true) {
          const queue = mailbox.get(marketId) ?? [];
          if (queue.length === 0) break;
          const drained = [...queue];
          mailbox.set(marketId, []);
          await executeAnalysisCycle(context, drained);
        }
      } finally {
        isBusy.delete(marketId);
      }
    },

    async handleObservationTrigger(
      marketId: string,
      observation: ObservationItem,
      context: PerceptionContext,
    ): Promise<void> {
      const queue = mailbox.get(marketId) ?? [];
      queue.push(observation);
      mailbox.set(marketId, queue);

      await processMailboxLoop(context);
    },

    interruptAnalysis(marketId: string): boolean {
      const controller = runningAnalyses.get(marketId);
      if (controller) {
        controller.abort();
        runningAnalyses.delete(marketId);
        mailbox.delete(marketId);
        isBusy.delete(marketId);
        return true;
      }
      return false;
    },

    abortAll(): void {
      for (const controller of runningAnalyses.values()) {
        controller.abort();
      }
      runningAnalyses.clear();
      mailbox.clear();
      isBusy.clear();
    },

    async respondToUser(marketId: string, userMessage: string): Promise<string> {
      const reply = `Acknowledged operator directive for ${marketId}: "${userMessage}". Incorporating into next perception cycle.`;
      await journalService.recordThought({
        level: "INFO",
        type: "SYSTEM_LIFECYCLE",
        source: "operator_interface",
        thought: reply,
        confidenceScore: 1.0,
        metadata: { marketId, userMessage },
      });
      return reply;
    },

    getMailboxPendingCount(marketId: string): number {
      return (mailbox.get(marketId) ?? []).length;
    },

    isAnalyzing(marketId: string): boolean {
      return Boolean(isBusy.get(marketId));
    },
  };
}
