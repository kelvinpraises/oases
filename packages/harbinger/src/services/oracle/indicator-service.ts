import {
  SAFE_FUNCTION_WHITELIST,
  registerSafeTool,
  getSafeToolByHash,
  hasSafeTool,
  computeToolHash,
  SecurityBlockError,
} from "../../tools/registry";
import { ratioFn, ratioTool } from "../../tools/ratio";
import { deltaFn, deltaTool } from "../../tools/delta";
import { thresholdFn, thresholdTool } from "../../tools/threshold";
import type {
  PureToolFn,
  RegisteredTool,
  ToolContext,
  ToolDefinition,
} from "../../tools/types";

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
