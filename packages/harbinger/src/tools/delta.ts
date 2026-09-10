import { ToolDefinition, PureToolFn } from "./types";

export const DELTA_CODE = `
function delta(inputs, params) {
  const current = Number(inputs.current);
  const previous = Number(inputs.previous);
  const mode = params.mode ?? "percentage";

  if (Number.isNaN(current) || Number.isNaN(previous)) {
    throw new Error("Invalid numerical input in delta tool");
  }

  if (mode === "absolute") {
    return current - previous;
  }

  if (previous === 0) {
    throw new Error("Division by zero in delta percentage mode (previous value is 0)");
  }

  return (current - previous) / previous;
}
`.trim();

export const deltaFn: PureToolFn = (inputs, params = {}) => {
  const current = Number(inputs.current);
  const previous = Number(inputs.previous);
  const mode = params.mode ?? "percentage";

  if (Number.isNaN(current) || Number.isNaN(previous)) {
    throw new Error("Invalid numerical input in delta tool");
  }

  if (mode === "absolute") {
    return current - previous;
  }

  if (previous === 0) {
    throw new Error("Division by zero in delta percentage mode (previous value is 0)");
  }

  return (current - previous) / previous;
};

export const deltaTool: ToolDefinition = {
  id: "delta",
  execute(args, ctx): number {
    const currKey = typeof args.current === "string" ? args.current : "";
    const prevKey = typeof args.previous === "string" ? args.previous : "";
    const current = currKey in ctx.signals ? ctx.signals[currKey] : (args.current as string | number);
    const previous = prevKey in ctx.signals ? ctx.signals[prevKey] : (args.previous as string | number);
    return deltaFn({ current, previous }, { mode: args.mode as "absolute" | "percentage" | undefined }) as number;
  },
};
