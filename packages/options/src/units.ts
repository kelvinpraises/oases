/**
 * Canonical unit conversion & formatting helpers for Oases options.
 * USDC uses 6 decimals; rates and shares use WAD (18 decimals).
 */

export const USDC_DECIMALS = 6;
export const USDC_SCALE = 1_000_000n;
export const SHARE_DECIMALS = 6;
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
 * Converts streaming rate in raw USDC/sec (6 decimals) to readable float USDC/sec (e.g. 1000000n -> 1.0).
 */
export function rateToPerSec(rate: bigint): number {
  return Number(rate) / 1_000_000;
}

/**
 * Converts readable float USDC/sec to raw USDC/sec rate (e.g. 1.0 -> 1000000n).
 */
export function perSecToRate(perSec: number): bigint {
  return BigInt(Math.round(perSec * 1_000_000));
}

/**
 * Converts raw shares (6 decimals) to readable float (e.g. 1000000n -> 1.0).
 */
export function sharesToNumber(shares: bigint): number {
  return Number(shares) / 1_000_000;
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
