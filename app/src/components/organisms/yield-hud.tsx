import { useMemo } from 'react'
import {
  TrendUp,
  Coins,
  Sparkle,
  Lightning,
} from '@phosphor-icons/react'
import { usePitches } from '@/hooks/use-pitches'
import { formatUSDC } from '@/utils/format-currency'
import type { ChildVault } from '@/types/tension-cast'

interface YieldHUDProps {
  vault: ChildVault
  injectedYieldUSDC?: number
  className?: string
}

export function YieldHUD({
  vault,
  injectedYieldUSDC,
  className = '',
}: YieldHUDProps) {
  const { pitches } = usePitches()

  // 3-Part Pot Architecture
  // 1. Genesis Seed ($20.00 baseline)
  const seedPot = vault.seedPotUSDC || 20.0
  // 2. Streamed Conviction (Participant conviction deposits)
  const streamedConviction = Math.max(0, vault.totalStreamedUSDC - seedPot)
  
  // 3. Pitch Economy Yield: Dynamically filtered by character from verified pitches
  const characterPitches = useMemo(() => {
    return pitches.filter(
      (p) => p.status === 'VERIFIED' && p.characterId === vault.characterId
    )
  }, [pitches, vault.characterId])

  const pitchYield =
    injectedYieldUSDC ??
    (characterPitches.length > 0
      ? characterPitches.length * 4.0
      : vault.injectedYieldUSDC || 4.0)

  const effectivePitchCount = Math.round(pitchYield / 4.0)

  // Total boosted prize pot
  const totalPrizePot = seedPot + streamedConviction + pitchYield

  // Subsidized yield boost percentage
  const baseline = seedPot + streamedConviction
  const yieldBonusPercent = useMemo(() => {
    if (baseline <= 0) return '0.0'
    return ((pitchYield / baseline) * 100).toFixed(1)
  }, [baseline, pitchYield])

  const multiplier = baseline > 0 ? (totalPrizePot / baseline).toFixed(2) : '1.00'

  // Strictly normalized progress bar percentages summing to 100%
  const seedPct = totalPrizePot > 0 ? (seedPot / totalPrizePot) * 100 : 33.33
  const streamPct = totalPrizePot > 0 ? (streamedConviction / totalPrizePot) * 100 : 33.33
  const yieldPct = totalPrizePot > 0 ? (pitchYield / totalPrizePot) * 100 : 33.34

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-5 ${className}`}>
      {/* HUD Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-base text-neutral-900 tracking-tight">
              Prize Pot HUD
            </h3>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 border border-emerald-200">
              <TrendUp className="w-3 h-3 text-emerald-600" weight="bold" />
              +{yieldBonusPercent}% SUBSIDIZED
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-sans mt-0.5">
            Prize pool expanded by the Pitch Economy ($4.00 / verified anomaly)
          </p>
        </div>

        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-xs text-neutral-400">Total Pot:</span>
          <span className="text-xl font-bold text-neutral-900 tabular-nums">
            {formatUSDC(totalPrizePot)}
          </span>
        </div>
      </div>

      {/* Visual Composition Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
          <span>Pot Breakdown</span>
          <span className="font-semibold text-neutral-800">Fully Backed</span>
        </div>

        <div className="h-3 w-full rounded-full bg-neutral-100 flex overflow-hidden p-0.5 gap-0.5">
          {/* 1. Genesis Seed */}
          <div
            className="h-full rounded-full bg-neutral-400 transition-[width] duration-300 ease-out"
            style={{ width: `${seedPct.toFixed(2)}%` }}
            title={`Seed: ${formatUSDC(seedPot)}`}
          />
          {/* 2. Streamed Conviction */}
          <div
            className="h-full rounded-full bg-neutral-900 transition-[width] duration-300 ease-out"
            style={{ width: `${streamPct.toFixed(2)}%` }}
            title={`Streamed: ${formatUSDC(streamedConviction)}`}
          />
          {/* 3. Pitch Economy Yield */}
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
            style={{ width: `${yieldPct.toFixed(2)}%` }}
            title={`Pitch Yield: ${formatUSDC(pitchYield)}`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-neutral-600 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neutral-400" />
            <span>1. Seed ({formatUSDC(seedPot)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neutral-900" />
            <span>2. Streamed ({formatUSDC(streamedConviction)})</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>3. Pitch Yield ({formatUSDC(pitchYield)})</span>
          </div>
        </div>
      </div>

      {/* 3 Pot Metric Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-3 font-mono text-xs">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 transition-colors hover:border-neutral-300">
          <span className="text-[10px] text-neutral-400 uppercase flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-neutral-500" />
            1. Seed Base
          </span>
          <div className="mt-1 font-bold text-neutral-900 text-sm">
            {formatUSDC(seedPot)}
          </div>
          <span className="text-[10px] text-neutral-500">$10 YES / $10 NO</span>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 transition-colors hover:border-neutral-300">
          <span className="text-[10px] text-neutral-400 uppercase flex items-center gap-1">
            <Lightning className="w-3.5 h-3.5 text-emerald-600" weight="fill" />
            2. Pitch Yield
          </span>
          <div className="mt-1 font-bold text-emerald-700 text-sm">
            +{formatUSDC(pitchYield)}
          </div>
          <span className="text-[10px] text-neutral-500">
            {effectivePitchCount} verified ($4/ea)
          </span>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 transition-colors hover:border-neutral-300">
          <span className="text-[10px] text-neutral-400 uppercase flex items-center gap-1">
            <Sparkle className="w-3.5 h-3.5 text-neutral-500" />
            3. Pot Multiplier
          </span>
          <div className="mt-1 font-bold text-neutral-900 text-sm">
            {multiplier}x Pot Value
          </div>
          <span className="text-[10px] text-emerald-700">Payout &gt; total deposits</span>
        </div>
      </div>
    </div>
  )
}
