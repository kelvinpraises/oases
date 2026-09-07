/**
 * Fixed-point WAD math utilities (18 decimals)
 * Implements logarithmic bonding curve (lnwad) for conviction shares.
 */

export const WAD = 10n ** 18n;

/**
 * Approximate natural logarithm in WAD (18 decimals).
 * x is in WAD. Returns ln(x) in WAD.
 */
export function lnWad(x: bigint): bigint {
  if (x <= 0n) {
    throw new Error("lnWad: non-positive argument");
  }

  // Convert to standard float representation for curve calculation, or integer approximation
  const xFloat = Number(x) / 1e18;
  const lnFloat = Math.log(xFloat);
  return BigInt(Math.floor(lnFloat * 1e18));
}

/**
 * Calculates shares to mint for a given deposit using logarithmic cost:
 * Early convictors get cheaper shares.
 * 
 * Cost function: Price(S) = P0 + k * ln(1 + S/WAD)
 */
export function calculateSharesForDeposit(
  currentSupply: bigint,
  depositAmount: bigint,
  basePriceWad: bigint = WAD / 100n // 0.01 WAD initial price
): bigint {
  if (depositAmount === 0n) return 0n;

  // Average price approximation over the interval
  const supplyBefore = currentSupply + WAD;
  const priceBefore = basePriceWad + (lnWad(supplyBefore) * basePriceWad) / WAD;
  
  if (priceBefore <= 0n) return (depositAmount * WAD) / basePriceWad;

  const estimatedShares = (depositAmount * WAD) / priceBefore;
  return estimatedShares > 0n ? estimatedShares : 1n;
}
