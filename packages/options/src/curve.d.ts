/**
 * Fixed-point WAD math utilities (18 decimals)
 * Implements logarithmic bonding curve (lnwad) for conviction shares.
 */
export declare const WAD: bigint;
/**
 * Approximate natural logarithm in WAD (18 decimals).
 * x is in WAD. Returns ln(x) in WAD.
 */
export declare function lnWad(x: bigint): bigint;
/**
 * Calculates shares to mint for a given deposit using logarithmic cost:
 * Early convictors get cheaper shares.
 *
 * Cost function: Price(S) = P0 + k * ln(1 + S/WAD)
 */
export declare function calculateSharesForDeposit(currentSupply: bigint, depositAmount: bigint, basePriceWad?: bigint): bigint;
//# sourceMappingURL=curve.d.ts.map