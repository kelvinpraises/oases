import { createHash } from "node:crypto";
import { PureToolFn, RegisteredTool, ToolDefinition } from "./types";
import { ratioFn, ratioTool, RATIO_CODE } from "./ratio";
import { deltaFn, deltaTool, DELTA_CODE } from "./delta";
import { thresholdFn, thresholdTool, THRESHOLD_CODE } from "./threshold";

export class SecurityBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityBlockError";
  }
}

// Map from SHA-256 hash -> RegisteredTool
export const SAFE_FUNCTION_WHITELIST = new Map<string, RegisteredTool>();

// Registry map by canonical tool ID
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {};

export function computeToolHash(codeString: string): string {
  return createHash("sha256").update(codeString.trim()).digest("hex");
}

export function registerSafeTool(
  id: string,
  name: string,
  codeString: string,
  fn: PureToolFn
): string {
  const hash = computeToolHash(codeString);
  const toolEntry: RegisteredTool = {
    id,
    name,
    codeString: codeString.trim(),
    hash,
    fn,
  };
  SAFE_FUNCTION_WHITELIST.set(hash, toolEntry);
  return hash;
}

export function getSafeToolByHash(hash: string): RegisteredTool {
  const tool = SAFE_FUNCTION_WHITELIST.get(hash);
  if (!tool) {
    throw new SecurityBlockError(
      `SECURITY BLOCK: Tool hash '${hash}' is not in the approved whitelist.`
    );
  }
  return tool;
}

export function hasSafeTool(hash: string): boolean {
  return SAFE_FUNCTION_WHITELIST.has(hash);
}

export function getTool(id: string): ToolDefinition {
  const tool = TOOL_REGISTRY[id];
  if (!tool) {
    throw new Error(`Tool '${id}' not found in TOOL_REGISTRY.`);
  }
  return tool;
}

// Pre-register canonical starter tools
export const RATIO_HASH = registerSafeTool("ratio", "Ratio Indicator", RATIO_CODE, ratioFn);
export const DELTA_HASH = registerSafeTool("delta", "Delta Velocity Indicator", DELTA_CODE, deltaFn);
export const THRESHOLD_HASH = registerSafeTool("threshold", "Threshold Invariant Gate", THRESHOLD_CODE, thresholdFn);

ratioTool.hash = RATIO_HASH;
deltaTool.hash = DELTA_HASH;
thresholdTool.hash = THRESHOLD_HASH;

TOOL_REGISTRY["ratio"] = ratioTool;
TOOL_REGISTRY["delta"] = deltaTool;
TOOL_REGISTRY["threshold"] = thresholdTool;
