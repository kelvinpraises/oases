import type { Hash } from "viem";

export type SettlementOutcome = "Yes" | "No";

export const OUTCOME_ENUM_MAP: Record<SettlementOutcome, number> = {
  Yes: 1,
  No: 2,
};

export interface SettlementResult {
  vaultId: string;
  outcome: SettlementOutcome;
  txHash: Hash;
  blockNumber: number;
  gasUsed: bigint;
  replayTicketHash?: string;
  timestamp: number;
}

export interface TxExecutionOptions {
  timeoutMs?: number;
  maxRetries?: number;
  gasBufferMultiplier?: number;
}

export class InsufficientGasBalanceError extends Error {
  constructor(
    public readonly currentBalance: bigint,
    public readonly requiredBalance: bigint,
    public readonly walletAddress: string,
  ) {
    super(
      `Insufficient operator gas balance: ${currentBalance.toString()} wei < required ${requiredBalance.toString()} wei on ${walletAddress}`,
    );
    this.name = "InsufficientGasBalanceError";
  }
}

export class SettlementVerificationError extends Error {
  constructor(
    public readonly vaultId: string,
    public readonly reason: string,
  ) {
    super(`Settlement verification failed for vault ${vaultId}: ${reason}`);
    this.name = "SettlementVerificationError";
  }
}

