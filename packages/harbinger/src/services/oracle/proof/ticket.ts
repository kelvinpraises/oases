import { SolverManifest } from "../ast/types";
import {
  BlockSnapshot,
  PrecedenceProof,
  ReplayTicket,
  TicketVerificationResult,
} from "./types";
import { evaluatePrecedence } from "./precedence";

export interface BuildTicketParams {
  vaultId: string;
  manifest: SolverManifest;
  precedenceProof: PrecedenceProof;
  blockSnapshots: BlockSnapshot[];
  queryTemplate?: string;
  timestamp?: number;
}

/**
 * Builds a self-contained, auditable Replay Ticket JSON object.
 */
export function buildReplayTicket(params: BuildTicketParams): ReplayTicket {
  const {
    vaultId,
    manifest,
    precedenceProof,
    blockSnapshots,
    queryTemplate = manifest.query ?? "",
    timestamp = Math.floor(Date.now() / 1000),
  } = params;

  return {
    vaultId,
    decision: precedenceProof.decision,
    manifest,
    precedenceProof,
    blockSnapshots,
    queryTemplate,
    timestamp,
  };
}

/**
 * Standalone verification function that verifies a Replay Ticket independently.
 * Anyone (a challenger node, auditor, or frontend) can execute this to verify ticket validity.
 */
export function verifyReplayTicket(ticket: ReplayTicket): TicketVerificationResult {
  const errors: string[] = [];

  if (!ticket || typeof ticket !== "object") {
    return { valid: false, decision: "RESOLVED_NO", errors: ["Ticket is null or not an object."] };
  }

  if (!ticket.vaultId || typeof ticket.vaultId !== "string") {
    errors.push("Missing or invalid vaultId in ticket.");
  }

  if (!ticket.manifest || typeof ticket.manifest !== "object") {
    errors.push("Missing manifest in ticket.");
  }

  if (!ticket.precedenceProof || typeof ticket.precedenceProof !== "object") {
    errors.push("Missing precedenceProof in ticket.");
  }

  if (!Array.isArray(ticket.blockSnapshots) || ticket.blockSnapshots.length === 0) {
    errors.push("Ticket contains no blockSnapshots.");
  }

  if (errors.length > 0) {
    return { valid: false, decision: ticket.decision ?? "RESOLVED_NO", errors };
  }

  const { manifest, precedenceProof, blockSnapshots } = ticket;
  const requiredDebounce = manifest.resolution.debounceBlocks ?? 2;

  // Verify snapshots consistency
  if (ticket.decision === "RESOLVED_YES") {
    if (blockSnapshots.length < requiredDebounce) {
      errors.push(
        `Insufficient block snapshots: Found ${blockSnapshots.length}, but manifest required at least ${requiredDebounce} consecutive blocks.`
      );
    }

    for (let i = 0; i < blockSnapshots.length; i++) {
      const snap = blockSnapshots[i];
      if (!snap.trigger) {
        errors.push(`Block snapshot at block ${snap.blockNumber} did not trigger breach condition.`);
      }

      if (i > 0) {
        const prevSnap = blockSnapshots[i - 1];
        if (snap.blockNumber !== prevSnap.blockNumber + 1) {
          errors.push(
            `Non-consecutive block sequence in snapshots: block ${prevSnap.blockNumber} followed by ${snap.blockNumber}.`
          );
        }
      }
    }
  }

  // Re-evaluate precedence state machine
  const evaluatedProof = evaluatePrecedence({
    breachBlock: precedenceProof.breachBlock,
    startBlock: manifest.timeBounds?.startBlock ?? precedenceProof.startBlock,
    deadlineBlock: manifest.timeBounds?.deadlineBlock ?? precedenceProof.deadlineBlock,
    abortTimestamp: precedenceProof.abortTimestamp,
    consecutiveBreachBlocks: blockSnapshots.length,
    requiredDebounce,
  });

  if (evaluatedProof.decision !== ticket.decision) {
    errors.push(
      `Decision mismatch: Ticket claims '${ticket.decision}', but re-evaluated proof yielded '${evaluatedProof.decision}'.`
    );
  }

  if (evaluatedProof.valid !== precedenceProof.valid) {
    errors.push(
      `Validity mismatch: Ticket proof validity (${precedenceProof.valid}) does not match evaluated validity (${evaluatedProof.valid}).`
    );
  }

  return {
    valid: errors.length === 0 && evaluatedProof.valid,
    decision: evaluatedProof.decision,
    errors,
  };
}
