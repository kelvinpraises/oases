import { create, all } from "mathjs";
import { getSafeToolByHash } from "../indicators/registry";
import { extractSignals } from "./extract";
import { decompressSolver } from "./compiler";
import {
  ExecutionStepTrace,
  PipelineExecutionResult,
  SolverManifest,
  SolverNode,
} from "./types";

// Create a scoped mathjs instance
const math = create(all);

// Clean/disable dangerous functions if needed
const dangerousFunctions = ["import", "createUnit", "reviver"];
const mathRecord = math as unknown as Record<string, unknown>;
for (const fnName of dangerousFunctions) {
  if (typeof mathRecord[fnName] === "function") {
    mathRecord[fnName] = () => {
      throw new Error(`Security Exception: Function '${fnName}' is disabled in Solver sandbox.`);
    };
  }
}

export class SolverRuntime {
  private scope: Record<string, unknown> = {};
  private trace: ExecutionStepTrace[] = [];

  constructor(extractedGlobals: Record<string, unknown>) {
    this.scope = { ...extractedGlobals };
  }

  public executeTree(nodes: SolverNode[]): void {
    for (const node of nodes) {
      switch (node.type) {
        case "expr": {
          const result = math.evaluate(node.formula, this.scope);
          this.scope[node.output] = result;
          this.trace.push({
            nodeId: node.id,
            nodeType: "expr",
            output: node.output,
            result,
            scopeSnapshot: { ...this.scope },
          });
          break;
        }

        case "call": {
          const toolEntry = getSafeToolByHash(node.toolHash);
          const resolvedInputs: Record<string, unknown> = {};

          if (node.inputs) {
            for (const [argName, varName] of Object.entries(node.inputs)) {
              resolvedInputs[argName] = this.scope[varName];
            }
          }

          const result = toolEntry.fn(resolvedInputs, node.params ?? {});
          this.scope[node.output] = result;
          this.trace.push({
            nodeId: node.id,
            nodeType: "call",
            output: node.output,
            result,
            scopeSnapshot: { ...this.scope },
          });
          break;
        }

        case "branch": {
          const conditionMet = Boolean(math.evaluate(node.condition, this.scope));
          this.trace.push({
            nodeId: node.id,
            nodeType: "branch",
            result: conditionMet,
            scopeSnapshot: { ...this.scope },
          });

          if (conditionMet) {
            this.executeTree(node.then);
          } else if (node.else && node.else.length > 0) {
            this.executeTree(node.else);
          }
          break;
        }

        case "loop": {
          const items = this.scope[node.items];
          if (!Array.isArray(items)) {
            throw new Error(`Loop items variable '${node.items}' is not an array.`);
          }
          const maxIter = Math.min(items.length, node.maxIterations ?? 100);
          for (let i = 0; i < maxIter; i++) {
            this.scope[node.itemVar] = items[i];
            this.executeTree(node.body);
          }
          break;
        }
      }
    }
  }

  public getScope(): Record<string, unknown> {
    return { ...this.scope };
  }

  public getTrace(): ExecutionStepTrace[] {
    return [...this.trace];
  }

  public isTriggered(triggerVariable: string): boolean {
    return Boolean(this.scope[triggerVariable]);
  }
}

/**
 * Runs a complete pipeline against raw GraphQL response data.
 * Accepts either a raw SolverManifest object or a Base64/zlib compiled string.
 */
export function runPipeline(
  manifestOrConfig: SolverManifest | string,
  rawGraphData: Record<string, unknown>
): PipelineExecutionResult {
  const manifest =
    typeof manifestOrConfig === "string"
      ? decompressSolver(manifestOrConfig)
      : manifestOrConfig;

  // Extract initial signals from the raw GraphQL response
  const globals = extractSignals(rawGraphData, manifest.globals);

  // Initialize runtime with extracted signals
  const runtime = new SolverRuntime(globals);

  // Execute AST tree
  runtime.executeTree(manifest.tree);

  const triggerVariable = manifest.resolution.triggerVariable;
  const triggered = runtime.isTriggered(triggerVariable);

  return {
    scope: runtime.getScope(),
    triggered,
    triggerVariable,
    trace: runtime.getTrace(),
  };
}
