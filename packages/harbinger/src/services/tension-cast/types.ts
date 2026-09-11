import type { ChildVault } from "../../models/ChildVault";

export interface ContagionCluster {
  directiveId: string;
  actors: ChildVault[];
  places: ChildVault[];
  acts: ChildVault[];
  bonds: ChildVault[];
  totalVaultCount: number;
}

export interface VaultGenesisResult {
  vaultId: string;
  vaultAddress: string;
  createTxHash: string;
  fundTxHash: string;
  nominalSeedYes: bigint;
  nominalSeedNo: bigint;
  totalPrimedPot: bigint;
}

export interface TensionCastGenesisResult {
  marketId: string;
  streamId: string;
  title: string;
  startBlock: number;
  deadlineBlock: number;
  primedVaults: VaultGenesisResult[];
  totalSeedCapital: bigint; // N * $20 in Wad
}

export interface TensionCastStatus {
  marketId: string;
  isExpired: boolean;
  remainingBlocks: number;
  cluster: ContagionCluster;
}
