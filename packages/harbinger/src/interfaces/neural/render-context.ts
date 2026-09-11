import type { SourceDirective } from "../../models/Directive";
import type { ContagionCluster } from "../../services/tension-cast/types";
import type { Job } from "../../models/Job";
import type { JournalEntry } from "../../models/JournalEntry";

export interface PerceptionContext {
  directive: SourceDirective;
  cluster: ContagionCluster;
  activeJobs: Job[];
  recentThoughts: JournalEntry[];
  operatorDirectives: string[];
  accumulatedObservations?: Array<{
    block: number;
    note: string;
    metricValue?: number;
  }>;
}

export function renderDirectiveContext(
  directive: SourceDirective,
  cluster: ContagionCluster,
  currentBlock?: number,
): string {
  const remaining = currentBlock
    ? Math.max(0, directive.deadlineBlock - currentBlock)
    : undefined;
  const blockStatus = remaining !== undefined ? ` (Remaining: ${remaining} blocks)` : "";

  return `
Tension Cast Directive: "${directive.title}" (ID: ${directive.marketId})
Time Window: [Start: ${directive.startBlock}, Deadline: ${directive.deadlineBlock}]${blockStatus}
Total Child Vaults: ${cluster.totalVaultCount}
- Actors (${cluster.actors.length}): ${cluster.actors.map((a) => `${a.vaultId} (${a.question})`).join("; ") || "None"}
- Places (${cluster.places.length}): ${cluster.places.map((p) => `${p.vaultId} (${p.question})`).join("; ") || "None"}
- Acts (${cluster.acts.length}): ${cluster.acts.map((a) => `${a.vaultId} (${a.question})`).join("; ") || "None"}
- Bonds (${cluster.bonds.length}): ${cluster.bonds.map((b) => `${b.vaultId} (${b.question})`).join("; ") || "None"}
`.trim();
}

export function renderSystemPrompt(ctx: PerceptionContext, currentBlock?: number): string {
  const directiveText = renderDirectiveContext(ctx.directive, ctx.cluster, currentBlock);
  const jobsText =
    ctx.activeJobs.length > 0
      ? ctx.activeJobs
          .map(
            (j) =>
              `- Job ${j.id} (${j.vaultId}): Cadence ${j.cadenceMs}ms, Status: ${j.status}, Consecutive Breaches: ${j.consecutiveBreaches}${j.lastTickBlock ? `, Last Block: ${j.lastTickBlock}` : ""}`,
          )
          .join("\n")
      : "No active jobs currently registered.";

  const recentThoughtsText =
    ctx.recentThoughts.length > 0
      ? ctx.recentThoughts
          .slice(0, 5)
          .map((t) => `[${t.level}] (${t.source}): ${t.thought}`)
          .join("\n")
      : "No prior journal thoughts.";

  const observationsText =
    ctx.accumulatedObservations && ctx.accumulatedObservations.length > 0
      ? ctx.accumulatedObservations
          .map(
            (o) =>
              `- [Block ${o.block}] ${o.note}${o.metricValue !== undefined ? ` (Metric: ${o.metricValue})` : ""}`,
          )
          .join("\n")
      : "No pending unobserved triggers in mailbox.";

  const directivesText =
    ctx.operatorDirectives.length > 0
      ? ctx.operatorDirectives.map((d) => `- ${d}`).join("\n")
      : "No manual operator directives active.";

  return `
You are the Harbinger Detective Agent presiding over an autonomous on-chain oracle harness in Oases.
Your mission: Inspect contagion across physical classes (Actor, Place, Act, Bond), formulate hypotheses, and steer loop cadences.

AIR-GAPPED SETTLEMENT INVARIANT (Axiom 4.1):
You possess ZERO settlement mutation tools. On-chain resolution is executed strictly by deterministic AST math in the background Reflex Engine.

=== ACTIVE TENSION CAST DIRECTIVE ===
${directiveText}

=== ACTIVE MONITORING LOOPS ===
${jobsText}

=== ACCUMULATED OBSERVATIONS (COALESCED MAILBOX) ===
${observationsText}

=== RECENT INVESTIGATIVE JOURNAL ENTRIES ===
${recentThoughtsText}

=== OPERATOR DIRECTIVES ===
${directivesText}
`.trim();
}
