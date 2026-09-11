import { ToolDefinition, PureToolFn } from "./types";

export const THRESHOLD_CODE = `
function threshold(inputs, params) {
  const signal = inputs.signal;
  const operator = params.operator ?? "<=";
  const target = params.target ?? inputs.target;

  if (signal === undefined || signal === null) {
    throw new Error("Missing signal in threshold comparator");
  }
  if (target === undefined || target === null) {
    throw new Error("Missing target in threshold comparator");
  }

  // Handle BigInt comparison if both are integer strings or BigInt
  const sStr = String(signal);
  const tStr = String(target);
  if (/^-?\\d+$/.test(sStr) && /^-?\\d+$/.test(tStr)) {
    try {
      const bSig = BigInt(sStr);
      const bTar = BigInt(tStr);
      switch (operator) {
        case "<=": return bSig <= bTar;
        case ">=": return bSig >= bTar;
        case "<":  return bSig < bTar;
        case ">":  return bSig > bTar;
        case "==": return bSig === bTar;
        case "!=": return bSig !== bTar;
        default:
          throw new Error("Unsupported operator: " + operator);
      }
    } catch {
      // fallback
    }
  }

  const s = Number(signal);
  const t = Number(target);

  // If inputs are non-numeric strings (e.g. status strings)
  if (Number.isNaN(s) || Number.isNaN(t)) {
    switch (operator) {
      case "==": return signal === target;
      case "!=": return signal !== target;
      default:
        throw new Error("Cannot use relational operator '" + operator + "' on non-numeric strings.");
    }
  }

  switch (operator) {
    case "<=": return s <= t;
    case ">=": return s >= t;
    case "<":  return s < t;
    case ">":  return s > t;
    case "==": return s === t;
    case "!=": return s !== t;
    default:
      throw new Error("Unsupported operator in threshold tool: " + operator);
  }
}
`.trim();

export const thresholdFn: PureToolFn = (inputs, params = {}) => {
  const signal = inputs.signal;
  const operator = params.operator ?? "<=";
  const target = params.target ?? inputs.target;

  if (signal === undefined || signal === null) {
    throw new Error("Missing signal in threshold comparator");
  }
  if (target === undefined || target === null) {
    throw new Error("Missing target in threshold comparator");
  }

  const sStr = String(signal);
  const tStr = String(target);
  if (/^-?\d+$/.test(sStr) && /^-?\d+$/.test(tStr)) {
    try {
      const bSig = BigInt(sStr);
      const bTar = BigInt(tStr);
      switch (operator) {
        case "<=": return bSig <= bTar;
        case ">=": return bSig >= bTar;
        case "<":  return bSig < bTar;
        case ">":  return bSig > bTar;
        case "==": return bSig === bTar;
        case "!=": return bSig !== bTar;
        default:
          throw new Error(`Unsupported operator in threshold tool: ${operator}`);
      }
    } catch {
      // fallback
    }
  }

  const s = Number(signal);
  const t = Number(target);

  if (Number.isNaN(s) || Number.isNaN(t)) {
    switch (operator) {
      case "==": return signal === target;
      case "!=": return signal !== target;
      default:
        throw new Error(`Cannot use relational operator '${operator}' on non-numeric strings.`);
    }
  }

  switch (operator) {
    case "<=": return s <= t;
    case ">=": return s >= t;
    case "<":  return s < t;
    case ">":  return s > t;
    case "==": return s === t;
    case "!=": return s !== t;
    default:
      throw new Error(`Unsupported operator in threshold tool: ${operator}`);
  }
};

export const thresholdTool: ToolDefinition = {
  id: "threshold",
  execute(args, ctx): boolean {
    const sigKey = typeof args.signal === "string" ? args.signal : "";
    const tarKey = typeof args.target === "string" ? args.target : "";
    const signal = sigKey in ctx.signals ? ctx.signals[sigKey] : (args.signal as string | number | boolean);
    const target = tarKey in ctx.signals ? ctx.signals[tarKey] : (args.target as string | number | boolean);
    return thresholdFn(
      { signal, target },
      { operator: args.operator as string | undefined, target }
    ) as boolean;
  },
};
