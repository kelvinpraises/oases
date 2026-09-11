import {
  extractSignals,
  resolveJsonPath,
  ExtractionError,
} from "../../pipeline/extract";
import {
  compileSolver,
  decompressSolver,
  encodeManifest,
  decodeManifest,
  CompilerError,
  MAX_LOOP_ITERATIONS,
} from "../../pipeline/compiler";
import {
  runPipeline,
  SolverRuntime,
} from "../../pipeline/runtime";
import type {
  SolverManifest,
  SolverNode,
  ExprNode,
  CallNode,
  BranchNode,
  LoopNode,
  ExecutionStepTrace,
  PipelineExecutionResult,
} from "../../pipeline/types";

export {
  extractSignals,
  resolveJsonPath,
  ExtractionError,
  compileSolver,
  decompressSolver,
  encodeManifest,
  decodeManifest,
  CompilerError,
  MAX_LOOP_ITERATIONS,
  runPipeline,
  SolverRuntime,
};

export type {
  SolverManifest,
  SolverNode,
  ExprNode,
  CallNode,
  BranchNode,
  LoopNode,
  ExecutionStepTrace,
  PipelineExecutionResult,
};

/**
 * Convenience alias to compile and zlib-compress a solver manifest.
 */
export function compileAndCompressSolver(manifest: SolverManifest): {
  compiledConfig: string;
  hash: string;
} {
  return compileSolver(manifest, { compress: true });
}

/**
 * Evaluates an AST pipeline against raw input data. Alias for runPipeline.
 */
export const evaluatePipeline = runPipeline;
