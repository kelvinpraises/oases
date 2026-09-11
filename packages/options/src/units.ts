/**
 * Canonical unit conversion & formatting helpers for Oases options.
 * USDC uses 6 decimals; rates and shares use WAD (18 decimals).
 */

export const USDC_DECIMALS = 6;
export const USDC_SCALE = 1_000_000n;
export const WAD_SCALE = 10n ** 18n;

/**
 * Converts float USDC (e.g. 20.5) to 6-decimal raw integer (20500000n).
 */
export function usdcToRaw(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

/**
 * Converts 6-decimal raw integer to float (e.g. 20500000n -> 20.5).
 */
export function rawToUsdc(raw: bigint): number {
  return Number(raw) / 1_000_000;
}

/**
 * Converts streaming rate in WAD/sec to readable float USDC/sec (e.g. 1e18 -> 1.0).
 */
export function rateToPerSec(rate: bigint): number {
  return Number(rate) / 1e18;
}

/**
 * Converts readable float USDC/sec to WAD/sec rate (e.g. 1.0 -> 1000000000000000000n).
 */
export function perSecToRate(perSec: number): bigint {
  return BigInt(Math.floor(perSec * 1e18));
}

/**
 * Converts WAD shares (18 decimals) to readable float.
 */
export function sharesToNumber(shares: bigint): number {
  return Number(shares) / 1e18;
}

/**
 * Formats a USDC amount (float number or raw 6-decimal bigint) as a "$X.XX" string.
 */
export function formatUsdc(amount: number | bigint, decimals: number = 2): string {
  const value = typeof amount === "bigint" ? rawToUsdc(amount) : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}
