export interface ToolSurface {
  id: string;
  name?: string;
  isMutation?: boolean;
  requiresProof?: boolean;
}

/**
 * Axiom 4.1: Critical Settlement Doors are Strictly Withheld from Neural Agent.
 * The Cognitive Brain must NEVER have authority to resolve vaults or dispatch on-chain settlements.
 */
export const WITHHELD_MUTATION_TOOLS: ReadonlySet<string> = new Set([
  "vault.resolve",
  "executeSettlement",
  "triggerRefund",
  "withdrawNominalCapital",
  "resolveVault",
  "settleMarket",
  "triggerPayout",
]);

/**
 * Whitelist of explicitly authorized neural tool surfaces.
 */
export const ALLOWED_NEURAL_TOOLS: ReadonlySet<string> = new Set([
  "logThought",
  "spawnJob",
  "killJob",
  "updateCadence",
  "listJobs",
  "querySubgraph",
  "evaluateMetric",
  "checkPrecedence",
  "dryRunTicket",
]);

export function isToolAuthorized(toolId: string): boolean {
  if (WITHHELD_MUTATION_TOOLS.has(toolId)) {
    return false;
  }
  return ALLOWED_NEURAL_TOOLS.has(toolId);
}

export function authorizeTools<T extends Record<string, { id: string }>>(
  toolMap: T,
  allowedSurfaces: ReadonlySet<string> = ALLOWED_NEURAL_TOOLS,
): { authorized: Partial<T>; withheld: string[] } {
  const authorized: Partial<T> = {};
  const withheld: string[] = [];

  for (const [key, tool] of Object.entries(toolMap)) {
    if (WITHHELD_MUTATION_TOOLS.has(tool.id) || !allowedSurfaces.has(tool.id)) {
      withheld.push(tool.id);
    } else {
      authorized[key as keyof T] = tool as T[keyof T];
    }
  }

  return { authorized, withheld };
}
