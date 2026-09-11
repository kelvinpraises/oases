import { useState, useEffect, useRef } from 'react'
import {
  projectShares,
  sharesToNumber,
  formatUsdc,
  perSecToRate,
  usdcToRaw,
} from '@oases/options'

export interface UseProjectedSharesOptions {
  board?: {
    pool: bigint
    sideRate: bigint
    g: bigint
    lastAdvanceMs: number
  }
  position?: {
    rate: bigint
    gPaid: bigint
    sharesAccrued?: bigint
    maxEndMs?: number
    depleted: boolean
  }
  // Simple preview mode inputs for interactive forms
  preview?: {
    ratePerSec: number
    depositUSDC: number
    startTimestamp?: number
    initialPoolUSDC?: number
  }
  enabled?: boolean
  throttleMs?: number
}

export interface ProjectedSharesResult {
  currentShares: bigint
  formattedShares: string
  projectedUsdc: number
  formattedUsdc: string
  isAccumulating: boolean
  elapsedSeconds: number
}

export function useProjectedShares({
  board,
  position,
  preview,
  enabled = true,
  throttleMs = 80, // ~12 FPS state update throttle to prevent React DOM thrashing
}: UseProjectedSharesOptions): ProjectedSharesResult {
  const [result, setResult] = useState<ProjectedSharesResult>({
    currentShares: 0n,
    formattedShares: '0.000000',
    projectedUsdc: 0,
    formattedUsdc: '$0.00',
    isAccumulating: false,
    elapsedSeconds: 0,
  })

  const lastUpdateRef = useRef<number>(0)
  const animFrameIdRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(preview?.startTimestamp ?? Date.now())

  // Keep startTimeRef fresh when preview changes
  useEffect(() => {
    if (preview?.startTimestamp) {
      startTimeRef.current = preview.startTimestamp
    }
  }, [preview?.startTimestamp])

  useEffect(() => {
    if (!enabled) {
      setResult((prev) => ({ ...prev, isAccumulating: false }))
      return
    }

    const tick = () => {
      const now = Date.now()

      // Throttle state update to prevent excessive DOM thrashing
      if (now - lastUpdateRef.current >= throttleMs) {
        lastUpdateRef.current = now

        let calculatedShares = 0n
        let isStreaming = false
        let elapsed = 0

        if (position && board) {
          // On-chain active position mode
          isStreaming = !position.depleted && position.rate > 0n
          calculatedShares = projectShares({
            board,
            position,
            atMs: now,
          })
          elapsed = Math.max(0, Math.floor((now - board.lastAdvanceMs) / 1000))
        } else if (preview && preview.ratePerSec > 0 && preview.depositUSDC > 0) {
          // Preview form mode
          const durationSeconds = preview.depositUSDC / preview.ratePerSec
          elapsed = Math.max(0, (now - startTimeRef.current) / 1000)
          const activeElapsed = Math.min(elapsed, durationSeconds)
          isStreaming = activeElapsed < durationSeconds

          const sideRateRaw = perSecToRate(preview.ratePerSec)
          const userRateRaw = sideRateRaw
          const initialPoolRaw = usdcToRaw(preview.initialPoolUSDC ?? 10) // default nominal $10 seeded pool

          calculatedShares = projectShares({
            board: {
              pool: initialPoolRaw,
              sideRate: sideRateRaw,
              g: 0n,
              lastAdvanceMs: startTimeRef.current,
            },
            position: {
              rate: userRateRaw,
              gPaid: 0n,
              maxEndMs: startTimeRef.current + durationSeconds * 1000,
              depleted: !isStreaming,
            },
            atMs: now,
          })
        }

        const sharesNum = sharesToNumber(calculatedShares)
        // Approximate valuation using linear bonding curve baseline
        const estimatedUsdc = sharesNum * 0.1

        setResult({
          currentShares: calculatedShares,
          formattedShares: sharesNum.toFixed(6),
          projectedUsdc: estimatedUsdc,
          formattedUsdc: formatUsdc(estimatedUsdc),
          isAccumulating: isStreaming,
          elapsedSeconds: Math.floor(elapsed),
        })
      }

      animFrameIdRef.current = requestAnimationFrame(tick)
    }

    animFrameIdRef.current = requestAnimationFrame(tick)

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current)
      }
    }
  }, [board, position, preview, enabled, throttleMs])

  return result
}
