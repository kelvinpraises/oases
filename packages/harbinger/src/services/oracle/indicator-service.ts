import {
  SAFE_FUNCTION_WHITELIST,
  registerSafeTool,
  getSafeToolByHash,
  hasSafeTool,
  computeToolHash,
  SecurityBlockError,
} from "./indicators/registry";
import { ratioFn, ratioTool } from "./indicators/ratio";
import { deltaFn, deltaTool } from "./indicators/delta";
import { thresholdFn, thresholdTool } from "./indicators/threshold";
import type {
  PureToolFn,
  RegisteredTool,
  ToolContext,
  ToolDefinition,
} from "./indicators/types";

export const ratio = ratioFn;
export const delta = deltaFn;
export const threshold = thresholdFn;

export {
  SAFE_FUNCTION_WHITELIST,
  registerSafeTool,
  getSafeToolByHash,
  hasSafeTool,
  computeToolHash,
  SecurityBlockError,
  ratioFn,
  ratioTool,
  deltaFn,
  deltaTool,
  thresholdFn,
  thresholdTool,
};

export type { PureToolFn, RegisteredTool, ToolContext, ToolDefinition };
