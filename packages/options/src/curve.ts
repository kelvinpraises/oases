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
  pool: bigint;
  sideRate: bigint;
  userRate: bigint;
  dt: bigint;
}

/**
 * Projects continuous share accrual for a user streaming at userRate.
 * userShares = sharesFromG(userRate, dG, 0n)
 */
export function projectShares(
  inputOrPool: ProjectSharesInput | bigint,
  sideRateArg?: bigint,
  userRateArg?: bigint,
  dtArg?: bigint
): bigint {
  let pool: bigint;
  let sideRate: bigint;
  let userRate: bigint;
  let dt: bigint;

  if (typeof inputOrPool === "object") {
    pool = inputOrPool.pool;
    sideRate = inputOrPool.sideRate;
    userRate = inputOrPool.userRate;
    dt = inputOrPool.dt;
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
