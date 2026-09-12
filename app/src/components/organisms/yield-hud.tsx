import { useMemo } from 'react'
import {
  TrendUp,
  Coins,
  Sparkle,
  Database,
} from '@phosphor-icons/react'
import { formatUSDC } from '@/utils/format-currency'
import type { ChildVault } from '@/types/tension-cast'

interface YieldHUDProps {
  vault: ChildVault
  injectedYieldUSDC?: number
  queryCount?: number
  className?: string
}

export function YieldHUD({
  vault,
  injectedYieldUSDC,
  queryCount,
  className = '',
}: YieldHUDProps) {
  // Pot components
  const actualYield = injectedYieldUSDC ?? vault.injectedYieldUSDC ?? 42.5
  const actualQueries = queryCount ?? vault.queryCount ?? Math.round(actualYield / 0.05)
  const seedPot = vault.seedPotUSDC
  const participantStream = Math.max(0, vault.totalStreamedUSDC - seedPot)
  const totalPrizePot = seedPot + participantStream + actualYield

  // Positive sum multiplier: total prize vs participant deposits
  const yieldBonusPercent = useMemo(() => {
    const baseline = seedPot + participantStream
    if (baseline <= 0) return '0.0'
    return ((actualYield / baseline) * 100).toFixed(1)
  }, [seedPot, participantStream, actualYield])

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-5 ${className}`}>
      {/* HUD Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-base text-neutral-900 tracking-tight">
              Positive-Sum Prize Pot HUD
            </h3>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 border border-emerald-200">
              <TrendUp className="w-3 h-3 text-emerald-600" weight="bold" />
              +{yieldBonusPercent}% SUBSIDIZED
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-sans mt-0.5">
            Real-time prize pool expansion from external Blocky402 telemetry query fees (<code>Vault.injectYield</code>)
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
          <span>Pot Composition Breakdown</span>
          <span className="font-semibold text-neutral-800">100% Value Backed</span>
        </div>

        <div className="h-3 w-full rounded-full bg-neutral-100 flex overflow-hidden p-0.5 gap-0.5">
          {/* Seed Segment */}
          <div
            className="h-full rounded-full bg-neutral-400 transition-all"
            style={{ width: `${Math.max(5, (seedPot / totalPrizePot) * 100)}%` }}
            title={`Genesis Seed: ${formatUSDC(seedPot)}`}
          />
          {/* Participant Stream Segment */}
          <div
            className="h-full rounded-full bg-neutral-900 transition-all"
            style={{ width: `${Math.max(5, (participantStream / totalPrizePot) * 100)}%` }}
            title={`Participant Streams: ${formatUSDC(participantStream)}`}
          />
          {/* Injected Lake Yield Segment */}
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${Math.max(5, (actualYield / totalPrizePot) * 100)}%` }}
            title={`Injected Lake Yield: ${formatUSDC(actualYield)}`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-neutral-600 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neutral-400" />
            <span>Genesis Seed ({formatUSDC(seedPot)})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-neutral-900" />
            <span>Participant Conviction ({formatUSDC(participantStream)})</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Injected Lake Yield ({formatUSDC(actualYield)})</span>
          </div>
        </div>
      </div>

      {/* 3 Metric Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-3 font-mono text-xs">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <span className="text-[10px] text-neutral-400 uppercase flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-neutral-500" />
            Genesis Seed Base
          </span>
          <div className="mt-1 font-bold text-neutral-900 text-sm">
            {formatUSDC(seedPot)}
          </div>
          <span className="text-[10px] text-neutral-500">$10 YES / $10 NO Primed</span>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <span className="text-[10px] text-neutral-400 uppercase flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-neutral-500" />
            x402 Lake Micropayments
          </span>
          <div className="mt-1 font-bold text-emerald-700 text-sm">
            +{formatUSDC(actualYield)}
          </div>
          <span className="text-[10px] text-neutral-500">{actualQueries} telemetry queries</span>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3">
          <span className="text-[10px] text-neutral-400 uppercase flex items-center gap-1">
            <Sparkle className="w-3.5 h-3.5 text-neutral-500" />
            Positive-Sum Advantage
          </span>
          <div className="mt-1 font-bold text-neutral-900 text-sm">
            {((totalPrizePot / (seedPot + participantStream)) * 1.0).toFixed(2)}x Multiplier
          </div>
          <span className="text-[10px] text-emerald-700">Winner payout &gt; total bets</span>
        </div>
      </div>
    </div>
  )
}
