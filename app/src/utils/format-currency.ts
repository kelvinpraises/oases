export function formatUSDC(amount: number | bigint | string, decimals = 2): string {
  const num = typeof amount === 'bigint' ? Number(amount) / 1e6 : Number(amount)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

export function formatNumber(amount: number | string, decimals = 2): string {
  const num = Number(amount)
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

export { formatBlockNumber } from './block-time'
