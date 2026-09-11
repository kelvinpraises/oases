import type { ChildVault } from "./ChildVault";

export interface SourceDirective {
  marketId: string; // keccak256 hash
  title: string;
  streamId: string;
  creator: string;
  startBlock: number;
  deadlineBlock: number;
  childVaults: ChildVault[]; // Open set of N floating child vaults
}
