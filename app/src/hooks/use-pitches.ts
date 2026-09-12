import { useState, useEffect, useCallback, useMemo } from 'react'
import type { AnomalyPitch } from '@/types/pitch'

const STORAGE_KEY = 'oases:pitches:v1'

const INITIAL_PITCHES: AnomalyPitch[] = [
  {
    id: 'pitch-init-1',
    characterId: 'whale-0x7a',
    characterName: 'Whale 0x7a',
    submitter: '0x388C818CA8B9251b393131C08a736A67ccB19297',
    thesis: 'Whale 0x7a health factor degrades below 1.05 during collateral liquidation cascade',
    metricKey: 'healthFactor',
    evaluationTimebox: 50,
    totalFeeUSDC: 5.0,
    potYieldUSDC: 4.0,
    gasReserveUSDC: 1.0,
    timestamp: Date.now() - 1000 * 60 * 18, // 18m ago
    status: 'VERIFIED',
    txHash: '0x712a...98f1',
  },
  {
    id: 'pitch-init-2',
    characterId: 'aave-core',
    characterName: 'Aave v3 Core Pool',
    submitter: '0x71C8fb4237745C1EE29547E2738A84994d38614f',
    thesis: 'Sudden borrowing shock drains available reserve liquidity below $5,000,000 threshold',
    metricKey: 'availableLiquidityUSD',
    evaluationTimebox: 100,
    totalFeeUSDC: 5.0,
    potYieldUSDC: 4.0,
    gasReserveUSDC: 1.0,
    timestamp: Date.now() - 1000 * 60 * 65, // 65m ago
    status: 'VERIFIED',
    txHash: '0x43e0...32bd',
  },
]

export function usePitches() {
  const [pitches, setPitches] = useState<AnomalyPitch[]>(() => {
    if (typeof window === 'undefined') return INITIAL_PITCHES
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch {
      // Fall back to initial pitches
    }
    return INITIAL_PITCHES
  })

  // Synchronize across browser tabs / local events
  useEffect(() => {
    const handleStorage = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          setPitches(JSON.parse(stored))
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('oases:pitch_submitted', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('oases:pitch_submitted', handleStorage)
    }
  }, [])

  const submitPitch = useCallback(
    async (params: {
      characterId: string
      characterName: string
      submitter: string
      thesis: string
      metricKey: string
      evaluationTimebox: number
    }): Promise<AnomalyPitch> => {
      const newPitch: AnomalyPitch = {
        id: `pitch-${Date.now()}`,
        characterId: params.characterId,
        characterName: params.characterName,
        submitter: params.submitter,
        thesis: params.thesis,
        metricKey: params.metricKey,
        evaluationTimebox: params.evaluationTimebox,
        totalFeeUSDC: 5.0,
        potYieldUSDC: 4.0, // 80% injected into pot
        gasReserveUSDC: 1.0, // 20% sentinel gas reserve
        timestamp: Date.now(),
        status: 'VERIFIED',
        txHash: `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      }

      setPitches((prev) => {
        const updated = [newPitch, ...prev]
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        } catch (err) {
          console.error('Failed to store pitches:', err)
        }
        return updated
      })

      // Dispatch event to inform other hooks/components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('oases:pitch_submitted'))
      }

      return newPitch
    },
    []
  )

  const verifiedPitches = useMemo(() => {
    return pitches.filter((p) => p.status === 'VERIFIED')
  }, [pitches])

  const totalPitchYieldUSDC = useMemo(() => {
    return verifiedPitches.reduce((sum, p) => sum + p.potYieldUSDC, 0)
  }, [verifiedPitches])

  return {
    pitches,
    verifiedPitches,
    verifiedCount: verifiedPitches.length,
    totalPitchYieldUSDC,
    submitPitch,
  }
}
