import type { PhysicalClass } from "./Taxonomy";

export interface ChildVault {
  vaultId: string;
  marketId: string;
  classType: PhysicalClass;
  targetAddress: string;
  question: string;
  compiledSolverConfig: string; // Base64 encoded AST manifest
}
