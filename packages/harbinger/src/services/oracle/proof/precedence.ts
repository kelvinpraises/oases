import { PrecedenceProof } from "./types";

export interface PrecedenceInput {
  breachBlock: number;
  startBlock: number;
  deadlineBlock: number;
  abortTimestamp?: number | null;
  currentBlockOrTimestamp?: number;
  consecutiveBreachBlocks: number;
  requiredDebounce?: number;
}

/**
 * Evaluates the formal mathematical precedence state machine Ω(Vi):
 *
 * 1. Abort Check: If emergency abort occurred before breach -> REFUNDED
 * 2. Window Check: startBlock <= breachBlock <= deadlineBlock
 * 3. 2-Block Confirmation Debounce: consecutiveBreachBlocks >= requiredDebounce
 * 4. Expiry: If deadline passed without confirmed breach -> RESOLVED_NO
 */
export function evaluatePrecedence(input: PrecedenceInput): PrecedenceProof {
  const {
    breachBlock,
    startBlock,
    deadlineBlock,
    abortTimestamp = null,
    consecutiveBreachBlocks,
    requiredDebounce = 2,
  } = input;

  const notAborted = abortTimestamp === null || breachBlock < abortTimestamp;
  const withinWindow = breachBlock >= startBlock && breachBlock <= deadlineBlock;
  const debounceVerified = consecutiveBreachBlocks >= requiredDebounce;

  // Case 1: Emergency Abort takes precedence over normal expiration and post-abort breaches
  if (!notAborted) {
    return {
      breachBlock,
      startBlock,
      deadlineBlock,
      abortTimestamp,
      withinWindow,
      notAborted: false,
      consecutiveBreachBlocks,
      requiredDebounce,
      debounceVerified,
      valid: false,
      decision: "REFUNDED",
      reason: "Emergency abort occurred prior to breach confirmation.",
    };
  }

  // Case 2: Breach occurred after deadline
  if (breachBlock > deadlineBlock) {
    return {
      breachBlock,
      startBlock,
      deadlineBlock,
      abortTimestamp,
      withinWindow: false,
      notAborted: true,
      consecutiveBreachBlocks,
      requiredDebounce,
      debounceVerified,
      valid: false,
      decision: "RESOLVED_NO",
      reason: `Breach block ${breachBlock} exceeded deadline block ${deadlineBlock}.`,
    };
  }

  // Case 3: Breach occurred before startBlock
  if (breachBlock < startBlock) {
    return {
      breachBlock,
      startBlock,
      deadlineBlock,
      abortTimestamp,
      withinWindow: false,
      notAborted: true,
      consecutiveBreachBlocks,
      requiredDebounce,
      debounceVerified,
      valid: false,
      decision: "RESOLVED_NO",
      reason: `Breach block ${breachBlock} is before start block ${startBlock}.`,
    };
  }

  // Case 4: Within window and not aborted, but failed 2-block confirmation debounce
  if (!debounceVerified) {
    return {
      breachBlock,
      startBlock,
      deadlineBlock,
      abortTimestamp,
      withinWindow: true,
      notAborted: true,
      consecutiveBreachBlocks,
      requiredDebounce,
      debounceVerified: false,
      valid: false,
      decision: "RESOLVED_NO",
      reason: `Breach rejected: Persisted for only ${consecutiveBreachBlocks} block(s), requiring at least ${requiredDebounce} consecutive blocks (filtering atomic flashloan spike).`,
    };
  }

  // Case 5: All precedence criteria satisfied: within window, not aborted, debounce confirmed
  return {
    breachBlock,
    startBlock,
    deadlineBlock,
    abortTimestamp,
    withinWindow: true,
    notAborted: true,
    consecutiveBreachBlocks,
    requiredDebounce,
    debounceVerified: true,
    valid: true,
    decision: "RESOLVED_YES",
    reason: "Valid breach confirmed across required consecutive blocks within market window.",
  };
}
