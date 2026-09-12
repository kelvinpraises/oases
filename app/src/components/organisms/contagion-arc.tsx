import { useMemo } from 'react'
import {
  ArrowRight,
  ShieldWarning,
  FlowArrow,
  CheckCircle,
} from '@phosphor-icons/react'
import { ClassBadge } from '@/components/molecules/class-badge'
import { StatusPill } from '@/components/molecules/status-pill'
import type { TensionCast } from '@/types/tension-cast'
import type { PhysicalClass } from '@/types/character'
import { formatUSDC } from '@/utils/format-currency'

interface ContagionArcProps {
  tensionCast: TensionCast
  selectedVaultId?: string
  onSelectVault?: (vaultId: string) => void
  className?: string
}

interface ContagionStep {
  classType: PhysicalClass
  roleDescription: string
  vectorDescription: string
  contagionOrder: number
}

const CLASS_FLOW_ORDER: Record<PhysicalClass, ContagionStep> = {
  Bond: {
    classType: 'Bond',
    roleDescription: 'Directed relational coupling (CRV Debt)',
    vectorDescription: 'Collateral leverage & liquidation threshold pressure',
    contagionOrder: 1,
  },
  Actor: {
    classType: 'Actor',
    roleDescription: 'Autonomous agent holding directional bias (Whale 0x7a)',
    vectorDescription: 'Health factor degradation toward HF <= 1.00',
    contagionOrder: 2,
  },
  Place: {
    classType: 'Place',
    roleDescription: 'Passive liquidity container (Aave v3 Core)',
    vectorDescription: 'Borrow utilization spike & reserve drain (> 95%)',
    contagionOrder: 3,
  },
  Act: {
    classType: 'Act',
    roleDescription: 'Finite execution event (MEV Liquidation)',
    vectorDescription: 'On-chain liquidation transaction auction execution',
    contagionOrder: 4,
  },
}

export function ContagionArc({
  tensionCast,
  selectedVaultId,
  onSelectVault,
  className = '',
}: ContagionArcProps) {
  // Sort child vaults by physical contagion sequence: Bond -> Actor -> Place -> Act
  const sortedVaults = useMemo(() => {
    return [...tensionCast.childVaults].sort((a, b) => {
      const orderA = CLASS_FLOW_ORDER[a.classType]?.contagionOrder ?? 99
      const orderB = CLASS_FLOW_ORDER[b.classType]?.contagionOrder ?? 99
      return orderA - orderB
    })
  }, [tensionCast.childVaults])

  const activeVault = useMemo(() => {
    return (
      sortedVaults.find((v) => v.id === selectedVaultId) ||
      sortedVaults[0]
    )
  }, [sortedVaults, selectedVaultId])

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden p-5 space-y-6 ${className}`}>
      {/* Component Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-sm text-neutral-900 tracking-tight">
              Systemic Contagion Arc Cluster
            </h3>
            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800 border border-amber-200">
              <FlowArrow className="w-3 h-3 text-amber-600" weight="bold" />
              CONTAGION VECTOR ACTIVE
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            Directed cascade dynamics propagating stress across the 4 Physical Classes: <code className="text-neutral-700 bg-neutral-100 px-1 py-0.5 rounded font-mono text-[11px]">Bond → Actor → Place → Act</code>
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-neutral-600 bg-neutral-50 px-3 py-1 rounded-lg border border-neutral-200">
          <ShieldWarning className="w-3.5 h-3.5 text-amber-600" />
          <span>Contagion Arcs: {Math.max(1, sortedVaults.length - 1)} Linked Vectors</span>
        </div>
      </div>

      {/* Contagion Pipeline Visual Flow */}
      <div className="relative">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-3">
          {sortedVaults.map((vault, index) => {
            const isSelected = vault.id === activeVault?.id
            const stepInfo = CLASS_FLOW_ORDER[vault.classType]
            const isLast = index === sortedVaults.length - 1

            return (
              <div
                key={vault.id}
                onClick={() => onSelectVault?.(vault.id)}
                className={`relative group cursor-pointer rounded-xl border p-4 transition-all duration-150 flex flex-col justify-between ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-50/80 shadow-md ring-1 ring-neutral-900'
                    : 'border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-xs'
                }`}
              >
                {/* Node Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-900 text-white font-mono text-[10px] font-bold">
                        {index + 1}
                      </span>
                      <ClassBadge classType={vault.classType} />
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isSelected && (
                        <span className="flex items-center gap-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-mono text-white font-medium">
                          <CheckCircle className="w-3 h-3 text-emerald-400" weight="fill" />
                          INSPECTING
                        </span>
                      )}
                      <StatusPill status={vault.status} />
                    </div>
                  </div>

                  {/* Character Name & Question */}
                  <div>
                    <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wide block">
                      Target Entity
                    </span>
                    <h4 className="font-display font-semibold text-sm text-neutral-900 mt-0.5 leading-snug">
                      {vault.characterName}
                    </h4>
                    <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                      {vault.question}
                    </p>
                  </div>
                </div>

                {/* Breach Invariant Gate & Flow Vector */}
                <div className="mt-4 space-y-3 pt-3 border-t border-neutral-100">
                  <div className="rounded-md bg-neutral-50 border border-neutral-200 p-2 font-mono text-[11px] space-y-0.5">
                    <span className="text-[9px] text-neutral-400 uppercase tracking-wider block">
                      Breach Invariant Gate
                    </span>
                    <span className="font-bold text-neutral-800">
                      {vault.metricTarget}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-neutral-400 text-[10px] block">Guaranteed Seed</span>
                      <span className="font-medium text-neutral-900">{formatUSDC(vault.seedPotUSDC)}</span>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-[10px] block">Streamed Conviction</span>
                      <span className="font-semibold text-emerald-700">{formatUSDC(vault.totalStreamedUSDC)}</span>
                    </div>
                  </div>

                  {/* Directional Propagation Vector Note */}
                  {!isLast && (
                    <div className="pt-2 flex items-center gap-1.5 text-[10px] font-mono text-amber-700 bg-amber-50/60 p-1.5 rounded border border-amber-200/60">
                      <FlowArrow className="w-3 h-3 shrink-0 text-amber-600" />
                      <span className="truncate">Spillover: {stepInfo?.vectorDescription || 'Contagion pressure'}</span>
                      <ArrowRight className="w-3 h-3 ml-auto shrink-0" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer: Selected Contagion Vector Analysis */}
      {activeVault && (
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-neutral-500">Active Focus:</span>
            <strong className="text-neutral-900">{activeVault.characterName}</strong>
            <span className="text-neutral-400">({activeVault.classType})</span>
          </div>

          <div className="flex items-center gap-3 text-neutral-600">
            <span>Base Price: <code className="text-neutral-800 font-semibold">$0.100 USDC</code></span>
            <span className="text-neutral-300">|</span>
            <span>Total Pot: <code className="text-neutral-800 font-semibold">{formatUSDC(activeVault.totalStreamedUSDC)}</code></span>
          </div>
        </div>
      )}
    </div>
  )
}
