import type { Address, Hex } from "viem";

export enum ConvictionSide {
  YES = 0,
  NO = 1
}

export interface TensionDescriptor {
  id: string;
  characterAddress: string;
  locationAddress: string;
  targetEvent: string;
  deadlineBlock: bigint;
  description: string;
}

export interface ConvictionQuote {
  side: ConvictionSide;
  depositAmount: bigint;
  estimatedShares: bigint;
  effectivePricePerShare: bigint;
  feeShare: bigint;
}

export interface VaultState {
  address: string;
  tension: TensionDescriptor;
  yesPool: bigint;
  noPool: bigint;
  yesShares: bigint;
  noShares: bigint;
  isResolved: boolean;
  winningSide?: ConvictionSide;
}

export interface MarketRecord {
  id: Hex;
  creator: Address;
  name: string;
  description: string;
  createdAt: number;
  exists: boolean;
}

export interface VaultRecord {
  id: Hex;
  marketId: Hex;
  question: string;
  solverConfig: string;
  creator: Address;
  status: number;
  outcome: number;
  resolvedAt: number;
  exists: boolean;
  yesPool: bigint;
  noPool: bigint;
  yesShares: bigint;
  noShares: bigint;
}

export interface BoardRecord {
  pool: bigint;
  sideRate: bigint;
  g: bigint;
  lastAdvance: number;
  sideShares: bigint;
}

export interface PositionRecord {
  rate: bigint;
  gPaid: bigint;
  sharesAccrued: bigint;
  maxEnd: number;
  depleted: boolean;
  pendingShares: bigint;
}

export interface ClaimableRecord {
  claimable: bigint;
  winningSide?: ConvictionSide;
  isResolved: boolean;
}

export interface LaneRecord {
  vaultId: Hex;
  side: ConvictionSide;
  rate: bigint;
}
