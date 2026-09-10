export function formatBlockNumber(block: number | bigint): string {
  return new Intl.NumberFormat('en-US').format(Number(block))
}

export function estimateBlockTime(
  currentBlock: number,
  targetBlock: number,
  blockTimeSeconds = 12
): string {
  const diff = targetBlock - currentBlock
  if (diff <= 0) return 'Passed'
  const seconds = diff * blockTimeSeconds
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) {
    return `~${hours}h ${minutes % 60}m`
  }
  return `~${minutes}m`
}
