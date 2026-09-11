import { Buffer } from "node:buffer";
import { deflateSync, inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { create, all } from "mathjs";
import { SolverManifest, SolverNode } from "./types";
import { hasSafeTool } from "../indicators/registry";

const math = create(all);

export class CompilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompilerError";
  }
}

export const MAX_LOOP_ITERATIONS = 100;

interface MathASTNode {
  isSymbolNode?: boolean;
  name?: string;
}

function validateFormula(formula: string, scope: Set<string>, nodeId: string): void {
  let ast: { filter: (predicate: (node: MathASTNode) => boolean) => MathASTNode[] };
  try {
    ast = math.parse(formula) as unknown as {
      filter: (predicate: (node: MathASTNode) => boolean) => MathASTNode[];
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CompilerError(`Node '${nodeId}': Syntax error in formula '${formula}': ${msg}`);
  }

  const symbolNodes = ast.filter((n: { isSymbolNode?: boolean; name?: string }) => Boolean(n.isSymbolNode));
  for (const symNode of symbolNodes) {
    const sym = symNode.name;
    if (!sym) continue;
    if (
      sym in math ||
      sym === "true" ||
      sym === "false" ||
      sym === "null" ||
      sym === "undefined"
    ) {
      continue;
    }
    if (!scope.has(sym)) {
      throw new CompilerError(`Node '${nodeId}': Formula references undeclared variable '${sym}'.`);
    }
  }
}

/**
 * Validates a solver manifest statically:
 * 1. Checks that all input variables exist in globals or prior outputs.
 * 2. Checks that all call nodes reference approved tool hashes in the whitelist.
 * 3. Enforces bounded loop iteration limits (max 100).
 * 4. Ensures triggerVariable is declared.
 */
export function validateManifest(manifest: SolverManifest): void {
  if (!manifest || typeof manifest !== "object") {
    throw new CompilerError("Invalid manifest: Manifest must be an object.");
  }

  if (!manifest.version) {
    throw new CompilerError("Invalid manifest: Missing version string.");
  }

  if (!manifest.globals || typeof manifest.globals !== "object") {
    throw new CompilerError("Invalid manifest: Missing globals mapping.");
  }

  if (!Array.isArray(manifest.tree)) {
    throw new CompilerError("Invalid manifest: Tree must be an array of SolverNode.");
  }

  if (!manifest.resolution || !manifest.resolution.triggerVariable) {
    throw new CompilerError("Invalid manifest: Missing resolution.triggerVariable.");
  }

  const availableVars = new Set<string>(Object.keys(manifest.globals));
  const seenNodeIds = new Set<string>();

  function validateNodes(nodes: SolverNode[], parentScope: Set<string>): Set<string> {
    const scope = new Set<string>(parentScope);

    for (const node of nodes) {
      if (!node.id || typeof node.id !== "string") {
        throw new CompilerError(`Invalid node: Node must have an id.`);
      }

      if (seenNodeIds.has(node.id)) {
        throw new CompilerError(`Duplicate node id '${node.id}'.`);
      }
      seenNodeIds.add(node.id);

      switch (node.type) {
        case "expr": {
          if (!node.formula || typeof node.formula !== "string") {
            throw new CompilerError(`Node '${node.id}': Missing or invalid formula.`);
          }
          if (!node.output || typeof node.output !== "string") {
            throw new CompilerError(`Node '${node.id}': Missing output variable name.`);
          }
          validateFormula(node.formula, scope, node.id);
          scope.add(node.output);
          break;
        }

        case "call": {
          if (!node.toolHash || typeof node.toolHash !== "string") {
            throw new CompilerError(`Node '${node.id}': Missing toolHash.`);
          }
          if (!hasSafeTool(node.toolHash)) {
            throw new CompilerError(
              `Node '${node.id}': Tool hash '${node.toolHash}' is not approved in SAFE_FUNCTION_WHITELIST.`
            );
          }
          if (!node.output || typeof node.output !== "string") {
            throw new CompilerError(`Node '${node.id}': Missing output variable name.`);
          }
          if (node.inputs && typeof node.inputs === "object") {
            for (const [argName, varName] of Object.entries(node.inputs)) {
              if (!scope.has(varName)) {
                throw new CompilerError(
                  `Node '${node.id}': Input argument '${argName}' references undeclared variable '${varName}'.`
                );
              }
            }
          }
          scope.add(node.output);
          break;
        }

        case "branch": {
          if (!node.condition || typeof node.condition !== "string") {
            throw new CompilerError(`Node '${node.id}': Missing branch condition.`);
          }
          validateFormula(node.condition, scope, node.id);
          if (!Array.isArray(node.then)) {
            throw new CompilerError(`Node '${node.id}': 'then' branch must be an array of nodes.`);
          }
          const thenScope = validateNodes(node.then, scope);
          let elseScope: Set<string> | undefined;
          if (node.else) {
            if (!Array.isArray(node.else)) {
              throw new CompilerError(`Node '${node.id}': 'else' branch must be an array of nodes.`);
            }
            elseScope = validateNodes(node.else, scope);
          }
          // Variables defined in both then and else branches can be considered available
          if (elseScope) {
            for (const v of thenScope) {
              if (elseScope.has(v)) {
                scope.add(v);
              }
            }
          }
          break;
        }

        case "loop": {
          if (!node.items || !scope.has(node.items)) {
            throw new CompilerError(
              `Node '${node.id}': Loop items references undeclared array variable '${node.items}'.`
            );
          }
          if (!node.itemVar || typeof node.itemVar !== "string") {
            throw new CompilerError(`Node '${node.id}': Missing itemVar.`);
          }
          const maxIter = node.maxIterations ?? MAX_LOOP_ITERATIONS;
          if (maxIter > MAX_LOOP_ITERATIONS || maxIter <= 0) {
            throw new CompilerError(
              `Node '${node.id}': Loop maxIterations must be between 1 and ${MAX_LOOP_ITERATIONS}.`
            );
          }
          const loopScope = new Set<string>(scope);
          loopScope.add(node.itemVar);
          validateNodes(node.body, loopScope);
          break;
        }

        default: {
          const fallbackNode = node as unknown as { type: string; id: string };
          throw new CompilerError(`Unknown node type '${fallbackNode.type}' in node '${fallbackNode.id}'.`);
        }
      }
    }

    return scope;
  }

  const finalScope = validateNodes(manifest.tree, availableVars);

  if (!finalScope.has(manifest.resolution.triggerVariable)) {
    throw new CompilerError(
      `Trigger variable '${manifest.resolution.triggerVariable}' is not defined by globals or any pipeline step.`
    );
  }
}

/**
 * Compiles and optionally compresses a SolverManifest into a Base64 string.
 */
export function compileSolver(
  manifest: SolverManifest,
  options: { compress?: boolean } = {}
): { compiledConfig: string; hash: string } {
  validateManifest(manifest);

  const jsonStr = JSON.stringify(manifest);
  let compiledConfig: string;

  if (options.compress) {
    const compressed = deflateSync(Buffer.from(jsonStr, "utf8"));
    compiledConfig = "zlib:" + compressed.toString("base64");
  } else {
    compiledConfig = Buffer.from(jsonStr, "utf8").toString("base64");
  }

  const hash = createHash("sha256").update(compiledConfig).digest("hex");
  return { compiledConfig, hash };
}

/**
 * Decompresses and decodes a solver configuration string back into a SolverManifest.
 */
export function decompressSolver(configString: string): SolverManifest {
  if (!configString || typeof configString !== "string") {
    throw new CompilerError("Invalid solver config string.");
  }

  let jsonStr: string;

  if (configString.startsWith("zlib:")) {
    const b64 = configString.slice(5);
    const buffer = Buffer.from(b64, "base64");
    jsonStr = inflateSync(buffer).toString("utf8");
  } else if (configString.trim().startsWith("{")) {
    jsonStr = configString;
  } else {
    jsonStr = Buffer.from(configString, "base64").toString("utf8");
  }

  const manifest = JSON.parse(jsonStr) as SolverManifest;
  validateManifest(manifest);
  return manifest;
}

export function encodeManifest(manifest: SolverManifest): string {
  return compileSolver(manifest, { compress: false }).compiledConfig;
}

export function decodeManifest(base64Str: string): SolverManifest {
  return decompressSolver(base64Str);
}
