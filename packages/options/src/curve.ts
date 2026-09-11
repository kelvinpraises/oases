/**
 * Fixed-point WAD math utilities (18 decimals) & Bonding Curve Engine.
 * Matches packages/contracts/src/vault/BondingBoard.sol for client-side projection.
 */

export const BASE_PRICE = 100_000n; // 1e5 (0.1 USDC with 6 decimals)
export const CURVE_K = 10_000_000_000n; // 1e10 (10,000 USDC with 6 decimals)
export const SHARE_SCALE = 1_000_000n; // 1e6
export const WAD = 10n ** 18n; // 1e18

/**
 * Natural logarithm in WAD (18 decimals).
 * x is in WAD. Returns ln(x) in WAD.
 */
export function lnWad(x: bigint): bigint {
  if (x <= 0n) {
    throw new Error("lnWad: non-positive argument");
  }

  const xFloat = Number(x) / 1e18;
  const lnFloat = Math.log(xFloat);
  return BigInt(Math.floor(lnFloat * 1e18));
}

/**
 * Evaluates the linear bonding curve price for a given pool amount.
 * price(pool) = BASE_PRICE + (BASE_PRICE * pool) / CURVE_K
 */
export function priceOf(pool: bigint): bigint {
  return BASE_PRICE + (BASE_PRICE * pool) / CURVE_K;
}

export interface SegMathInput {
  pool: bigint;
  sideRate: bigint;
  dt: bigint;
}

export interface SegMathResult {
  newPool: bigint;
  dG: bigint;
}

/**
 * Evaluates continuous area segment math over a steady-rate stretch.
 * Matches BondingBoard.segMath exactly.
 */
export function segMath(
  inputOrPool: SegMathInput | bigint,
  sideRateArg?: bigint,
  dtArg?: bigint
): SegMathResult {
  let pool: bigint;
  let sideRate: bigint;
  let dt: bigint;

  if (typeof inputOrPool === "object") {
    pool = inputOrPool.pool;
    sideRate = inputOrPool.sideRate;
    dt = inputOrPool.dt;
  } else {
    pool = inputOrPool;
    sideRate = sideRateArg ?? 0n;
    dt = dtArg ?? 0n;
  }

  const p0 = priceOf(pool);
  const newPool = pool + sideRate * dt;
  const p1 = priceOf(newPool);

  if (p1 <= p0 || sideRate === 0n || dt === 0n) {
    return { newPool, dG: 0n };
  }

  const ratioWad = (p1 * WAD) / p0;
  const lnv = lnWad(ratioWad);
  if (lnv <= 0n) {
    return { newPool, dG: 0n };
  }

  const dG = (SHARE_SCALE * CURVE_K * lnv) / (BASE_PRICE * sideRate);
  return { newPool, dG };
}

/**
 * Evaluates shares minted from accumulator G difference.
 * WAD-scaled: (rate * (g - gPaid)) / WAD
 */
export const sharesFromG = (rate: bigint, g: bigint, gPaid: bigint): bigint =>
  (rate * (g - gPaid)) / WAD;

export interface ProjectSharesInput {
  board: {
    pool: bigint;
    sideRate: bigint;
    g: bigint;
    lastAdvanceMs: number;
  };
  position: {
    rate: bigint;
    gPaid: bigint;
    sharesAccrued?: bigint;
    maxEndMs?: number;
    depleted: boolean;
  };
  atMs: number;
  resolvedAtMs?: number;
}

export interface LegacyProjectSharesInput {
  pool: bigint;
  sideRate: bigint;
  userRate: bigint;
  dt: bigint;
}

/**
 * Projects continuous share accrual for a funder from entry state (gPaid and board.g).
 * Accrued shares are in 6-decimal SHARE_SCALE (matching Vault.sol pendingShares).
 */
function toMs(ts: number | undefined): number | undefined {
  if (ts === undefined) return undefined;
  return ts < 10_000_000_000 ? ts * 1000 : ts;
}

export function projectShares(
  inputOrPool: ProjectSharesInput | LegacyProjectSharesInput | bigint,
  sideRateArg?: bigint,
  userRateArg?: bigint,
  dtArg?: bigint
): bigint {
  if (typeof inputOrPool === "object" && "board" in inputOrPool) {
    const { board, position, atMs, resolvedAtMs } = inputOrPool;
    const baseAccrued = position.sharesAccrued ?? 0n;

    if (position.depleted || position.rate === 0n || board.sideRate === 0n) {
      return (baseAccrued + position.rate * (board.g - position.gPaid)) / WAD;
    }

    const lastAdvanceMs = toMs(board.lastAdvanceMs) ?? 0;
    const atMsNorm = toMs(atMs) ?? 0;
    const maxEndMsNorm = toMs(position.maxEndMs);
    const resolvedAtMsNorm = toMs(resolvedAtMs);

    const freezeMs = Math.min(
      atMsNorm,
      maxEndMsNorm ?? atMsNorm,
      resolvedAtMsNorm ?? atMsNorm
    );

    if (freezeMs <= lastAdvanceMs) {
      return (baseAccrued + position.rate * (board.g - position.gPaid)) / WAD;
    }

    const dtSeconds = BigInt(Math.floor((freezeMs - lastAdvanceMs) / 1000));
    const { dG } = segMath({ pool: board.pool, sideRate: board.sideRate, dt: dtSeconds });
    const gNow = board.g + dG;

    return (baseAccrued + position.rate * (gNow - position.gPaid)) / WAD;
  }

  // Legacy fallback for simple dt-based projection
  let pool: bigint;
  let sideRate: bigint;
  let userRate: bigint;
  let dt: bigint;

  if (typeof inputOrPool === "object") {
    pool = (inputOrPool as LegacyProjectSharesInput).pool;
    sideRate = (inputOrPool as LegacyProjectSharesInput).sideRate;
    userRate = (inputOrPool as LegacyProjectSharesInput).userRate;
    dt = (inputOrPool as LegacyProjectSharesInput).dt;
  } else {
    pool = inputOrPool;
    sideRate = sideRateArg ?? 0n;
    userRate = userRateArg ?? 0n;
    dt = dtArg ?? 0n;
  }

  if (userRate === 0n || dt === 0n) return 0n;

  const { dG } = segMath({ pool, sideRate, dt });
  return sharesFromG(userRate, dG, 0n);
}

/**
 * Legacy helper calculating shares for an instant deposit.
 */
export function calculateSharesForDeposit(
  currentSupply: bigint,
  depositAmount: bigint,
  basePriceWad: bigint = WAD / 100n
): bigint {
  if (depositAmount === 0n) return 0n;

  const supplyBefore = currentSupply + WAD;
  const priceBefore = basePriceWad + (lnWad(supplyBefore) * basePriceWad) / WAD;

  if (priceBefore <= 0n) return (depositAmount * WAD) / basePriceWad;

  const estimatedShares = (depositAmount * WAD) / priceBefore;
  return estimatedShares > 0n ? estimatedShares : 1n;
}
