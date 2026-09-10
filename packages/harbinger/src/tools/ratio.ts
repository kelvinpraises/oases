import { ToolDefinition, PureToolFn } from "./types";

export const RATIO_CODE = `
function ratio(inputs, params) {
  const num = inputs.num;
  const den = inputs.den;
  const scale = params.scale ?? 1;

  if (den === undefined || den === null || Number(den) === 0) {
    throw new Error("Division by zero in ratio tool");
  }

  // If explicit BigInt or large strings (> 15 digits)
  const isBigIntType = typeof num === "bigint" || typeof den === "bigint";
  const numStr = String(num);
  const denStr = String(den);
  const isLargeIntString = (numStr.length > 15 || denStr.length > 15) && /^\\d+$/.test(numStr) && /^\\d+$/.test(denStr);

  if (isBigIntType || isLargeIntString) {
    try {
      const bNum = BigInt(numStr);
      const bDen = BigInt(denStr);
      const bScale = BigInt(scale);
      return ((bNum * bScale) / bDen).toString();
    } catch {
      // fallback
    }
  }

  const n = Number(num);
  const d = Number(den);
  const s = Number(scale);
  return (n * s) / d;
}
`.trim();

export const ratioFn: PureToolFn = (inputs, params = {}) => {
  const num = inputs.num;
  const den = inputs.den;
  const scale = params.scale ?? 1;

  if (den === undefined || den === null || Number(den) === 0) {
    throw new Error("Division by zero in ratio tool");
  }

  const isBigIntType = typeof num === "bigint" || typeof den === "bigint";
  const numStr = String(num);
  const denStr = String(den);
  const isLargeIntString = (numStr.length > 15 || denStr.length > 15) && /^\d+$/.test(numStr) && /^\d+$/.test(denStr);

  if (isBigIntType || isLargeIntString) {
    try {
      const bNum = BigInt(numStr);
      const bDen = BigInt(denStr);
      const bScale = BigInt(scale as string | number | bigint | boolean);
      return ((bNum * bScale) / bDen).toString();
    } catch {
      // fallback
    }
  }

  const n = Number(num);
  const d = Number(den);
  const s = Number(scale);
  return (n * s) / d;
};

export const ratioTool: ToolDefinition = {
  id: "ratio",
  execute(args, ctx): string | number {
    const numKey = typeof args.num === "string" ? args.num : "";
    const denKey = typeof args.den === "string" ? args.den : "";
    const num = numKey in ctx.signals ? ctx.signals[numKey] : (args.num as string | number);
    const den = denKey in ctx.signals ? ctx.signals[denKey] : (args.den as string | number);
    return ratioFn({ num, den }, { scale: args.scale as number | string | undefined }) as string | number;
  },
};
