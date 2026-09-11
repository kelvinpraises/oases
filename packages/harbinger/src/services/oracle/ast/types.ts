export type ExprNode = {
  type: "expr";
  id: string;
  formula: string; // e.g., "collateral / debt" or "healthRatio <= 1.0"
  output: string;
};

export type CallNode = {
  type: "call";
  id: string;
  toolHash: string; // SHA-256 hash from SAFE_FUNCTION_WHITELIST
  inputs: Record<string, string>; // argName -> variableName in scope
  params?: Record<string, unknown>; // static tool parameters (scale, mode, operator, etc.)
  output: string;
};

export type BranchNode = {
  type: "branch";
  id: string;
  condition: string; // mathjs boolean expression
  then: SolverNode[];
  else?: SolverNode[];
};

export type LoopNode = {
  type: "loop";
  id: string;
  items: string; // variable name in scope representing an array
  itemVar: string; // loop item variable name
  body: SolverNode[];
  maxIterations?: number; // bounded iteration ceiling (max 100)
};

export type SolverNode = ExprNode | CallNode | BranchNode | LoopNode;

export interface SolverManifest {
  version: string;
  query?: string; // Stateless GraphQL query template with block number
  params?: Record<string, unknown>;
  timeBounds?: {
    startBlock: number;
    deadlineBlock: number;
  };
  globals: Record<string, string>; // signalName -> GraphQL dot-path (e.g. "data.account.totalCollateralUSD")
  tree: SolverNode[];
  resolution: {
    triggerVariable: string; // Variable in scope that must be boolean true
    debounceBlocks?: number; // Default 2 consecutive blocks
  };
}

export interface ExecutionStepTrace {
  nodeId: string;
  nodeType: SolverNode["type"];
  output?: string;
  result?: unknown;
  scopeSnapshot: Record<string, unknown>;
}

export interface PipelineExecutionResult {
  scope: Record<string, unknown>;
  triggered: boolean;
  triggerVariable: string;
  trace: ExecutionStepTrace[];
}
