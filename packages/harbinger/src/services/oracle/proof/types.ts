import { SolverManifest } from "../ast/types";

export type ResolutionDecision = "RESOLVED_YES" | "RESOLVED_NO" | "REFUNDED";

export interface PrecedenceProof {
  breachBlock: number;
  startBlock: number;
  deadlineBlock: number;
  abortTimestamp: number | null;
  withinWindow: boolean;
  notAborted: boolean;
  consecutiveBreachBlocks: number;
  requiredDebounce: number;
  debounceVerified: boolean;
  valid: boolean;
  decision: ResolutionDecision;
  reason: string;
}

export interface BlockSnapshot {
  blockNumber: number;
  inputs: Record<string, unknown>;
  intermediate: Record<string, unknown>;
  trigger: boolean;
}

export interface ReplayTicket {
  vaultId: string;
  decision: ResolutionDecision;
  manifest: SolverManifest;
  precedenceProof: PrecedenceProof;
  blockSnapshots: BlockSnapshot[];
  queryTemplate: string;
  timestamp: number;
}

export interface TicketVerificationResult {
  valid: boolean;
  decision: ResolutionDecision;
  errors: string[];
}
