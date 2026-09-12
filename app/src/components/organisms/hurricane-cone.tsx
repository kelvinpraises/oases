import { useMemo, useState } from 'react'
import {
  Pulse,
  Info,
} from '@phosphor-icons/react'
import type { ChildVault } from '@/types/tension-cast'
import type { ProtocolCharacter } from '@/types/character'
import { formatBlockNumber } from '@/utils/format-currency'

export type AnomalyGradeCode = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5'

export interface AnomalyGradeInfo {
  code: AnomalyGradeCode
  label: string
  badgeClass: string
  description: string
  zMin: number
  zMax: number
}

export const ANOMALY_GRADES: Record<AnomalyGradeCode, AnomalyGradeInfo> = {
  G0: {
    code: 'G0',
    label: 'Normal',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    description: 'Trajectory inside nominal rolling expectation (|z| < 1.5).',
    zMin: 0,
    zMax: 1.5,
  },
  G1: {
    code: 'G1',
    label: 'Anomaly',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    description: 'First deviation breach detected (z >= 1.5). Child conviction vault spawns.',
    zMin: 1.5,
    zMax: 2.5,
  },
  G2: {
    code: 'G2',
    label: 'Stress',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    description: 'Systemic contagion accelerating (z >= 2.5). Polling cadence accelerated to 2s.',
    zMin: 2.5,
    zMax: 3.5,
  },
  G3: {
    code: 'G3',
    label: 'Breach Gate',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    description: 'Invariant gate breached (z >= 3.5 / Health Factor <= 1.00). 2-block confirmation debounce active.',
    zMin: 3.5,
    zMax: 4.5,
  },
  G4: {
    code: 'G4',
    label: 'Liquidation',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    description: 'On-chain liquidation spiral execution in flight.',
    zMin: 4.5,
    zMax: 5.5,
  },
  G5: {
    code: 'G5',
    label: 'Settled',
    badgeClass: 'bg-neutral-100 text-neutral-900 border-neutral-300',
    description: 'Precedence formula verified. On-chain settlement finalized.',
    zMin: 5.5,
    zMax: 99,
  },
}

interface HurricaneConeProps {
  title?: string
  vault?: ChildVault
  character?: ProtocolCharacter
  currentBlock?: number
  startBlock?: number
  deadlineBlock?: number
  className?: string
}

export function HurricaneCone({
  title = 'Trajectory Forecast',
  vault,
  character,
  currentBlock = 20000142,
  startBlock = 20000000,
  deadlineBlock = 20000300,
  className = '',
}: HurricaneConeProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    block: number
    value: number
    zScore: number
    upper3: number
    lower3: number
  } | null>(null)

  // Determine entity identifiers
  const entityName = vault?.characterName || character?.name || 'Whale 0x7a Health Factor'
  const metricLabel = vault?.metricTarget || character?.primaryMetric || 'healthFactor <= 1.00'

  // Metric-specific configuration
  const config = useMemo(() => {
    const isUtilization = vault?.id?.includes('reserve') || character?.id?.includes('reserve')
    const isDebt = vault?.id?.includes('debt') || character?.id?.includes('debt')

    if (isUtilization) {
      return {
        unit: '%',
        baseline: 0.82,
        threshold: 0.95,
        currentValue: 0.912,
        zScore: 2.15,
        grade: 'G1' as AnomalyGradeCode,
        thresholdLabel: 'Invariant: 95.0% Max Utilization',
        formatValue: (v: number) => `${(v * 100).toFixed(1)}%`,
        yMin: 0.75,
        yMax: 1.02,
        direction: 'up',
      }
    }

    if (isDebt) {
      return {
        unit: 'M',
        baseline: 12.5,
        threshold: 15.0,
        currentValue: 14.85,
        zScore: 2.85,
        grade: 'G2' as AnomalyGradeCode,
        thresholdLabel: 'Invariant: $15.0M Debt Cap',
        formatValue: (v: number) => `$${v.toFixed(2)}M`,
        yMin: 11.0,
        yMax: 16.5,
        direction: 'up',
      }
    }

    // Default: Whale Health Factor
    return {
      unit: '',
      baseline: 1.25,
      threshold: 1.00,
      currentValue: 1.08,
      zScore: 2.41,
      grade: 'G1' as AnomalyGradeCode,
      thresholdLabel: 'Breach Gate: HF <= 1.00',
      formatValue: (v: number) => v.toFixed(2),
      yMin: 0.85,
      yMax: 1.45,
      direction: 'down',
    }
  }, [vault?.id, character?.id])

  const gradeInfo = ANOMALY_GRADES[config.grade]

  // Synthesize deterministic trajectory points & expanding forecast cone
  const chartData = useMemo(() => {
    const totalBlocks = deadlineBlock - startBlock
    const steps = 24
    const blockStep = totalBlocks / steps

    const points: Array<{
      block: number
      isFuture: boolean
      value: number
      mean: number
      upper1: number
      lower1: number
      upper2: number
      lower2: number
      upper3: number
      lower3: number
      zScore: number
    }> = []

    for (let i = 0; i <= steps; i++) {
      const block = Math.round(startBlock + i * blockStep)
      const isFuture = block > currentBlock
      const progress = i / steps // 0 to 1

      // Cone expands with sqrt of time distance from start
      const timeFactor = Math.sqrt(progress + 0.1)
      const sigma = (config.yMax - config.yMin) * 0.05 * timeFactor

      const mean = config.direction === 'down'
        ? config.baseline - (config.baseline - config.threshold) * progress * 0.7
        : config.baseline + (config.threshold - config.baseline) * progress * 0.7

      // Historical actual path with slight fluctuation
      let val = mean
      if (!isFuture) {
        const osc = Math.sin(i * 1.3) * sigma * 0.6
        val = config.direction === 'down'
          ? config.baseline - (config.baseline - config.currentValue) * (block - startBlock) / (currentBlock - startBlock) + osc
          : config.baseline + (config.currentValue - config.baseline) * (block - startBlock) / (currentBlock - startBlock) + osc
      } else {
        // Projected trajectory drifting toward breach boundary
        const futureProgress = (block - currentBlock) / (deadlineBlock - currentBlock)
        val = config.direction === 'down'
          ? config.currentValue - (config.currentValue - (config.threshold - 0.04)) * futureProgress
          : config.currentValue + ((config.threshold + 0.5) - config.currentValue) * futureProgress
      }

      const z = Math.abs(val - mean) / Math.max(0.001, sigma)

      points.push({
        block,
        isFuture,
        value: val,
        mean,
        upper1: mean + sigma,
        lower1: mean - sigma,
        upper2: mean + 2 * sigma,
        lower2: mean - 2 * sigma,
        upper3: mean + 3 * sigma,
        lower3: mean - 3 * sigma,
        zScore: parseFloat(z.toFixed(2)),
      })
    }

    return points
  }, [startBlock, deadlineBlock, currentBlock, config])

  // SVG Coordinates mapping
  const width = 640
  const height = 240
  const padding = { top: 25, right: 35, bottom: 35, left: 55 }

  const innerWidth = width - padding.left - padding.right
  const innerHeight = height - padding.top - padding.bottom

  const scaleX = (block: number) => {
    return padding.left + ((block - startBlock) / (deadlineBlock - startBlock)) * innerWidth
  }

  const scaleY = (val: number) => {
    return (
      padding.top +
      innerHeight -
      ((val - config.yMin) / (config.yMax - config.yMin)) * innerHeight
    )
  }

  // Generate SVG polygon paths for 3-sigma, 2-sigma, 1-sigma cones
  const { pathCone3, pathCone2, pathCone1, pathMean, pathActual, pathProjected } = useMemo(() => {
    const ptsUpper3: string[] = []
    const ptsLower3: string[] = []
    const ptsUpper2: string[] = []
    const ptsLower2: string[] = []
    const ptsUpper1: string[] = []
    const ptsLower1: string[] = []
    const ptsMean: string[] = []
    const ptsActual: string[] = []
    const ptsProjected: string[] = []

    chartData.forEach((p) => {
      const x = scaleX(p.block)
      ptsUpper3.push(`${x},${scaleY(p.upper3)}`)
      ptsLower3.unshift(`${x},${scaleY(p.lower3)}`)

      ptsUpper2.push(`${x},${scaleY(p.upper2)}`)
      ptsLower2.unshift(`${x},${scaleY(p.lower2)}`)

      ptsUpper1.push(`${x},${scaleY(p.upper1)}`)
      ptsLower1.unshift(`${x},${scaleY(p.lower1)}`)

      ptsMean.push(`${x},${scaleY(p.mean)}`)

      if (!p.isFuture || p.block === currentBlock) {
        ptsActual.push(`${x},${scaleY(p.value)}`)
      }
      if (p.isFuture || p.block === currentBlock) {
        ptsProjected.push(`${x},${scaleY(p.value)}`)
      }
    })

    return {
      pathCone3: `M ${ptsUpper3.join(' L ')} L ${ptsLower3.join(' L ')} Z`,
      pathCone2: `M ${ptsUpper2.join(' L ')} L ${ptsLower2.join(' L ')} Z`,
      pathCone1: `M ${ptsUpper1.join(' L ')} L ${ptsLower1.join(' L ')} Z`,
      pathMean: `M ${ptsMean.join(' L ')}`,
      pathActual: `M ${ptsActual.join(' L ')}`,
      pathProjected: `M ${ptsProjected.join(' L ')}`,
    }
  }, [chartData, scaleX, scaleY])

  const thresholdY = scaleY(config.threshold)
  const currentX = scaleX(currentBlock)
  const currentY = scaleY(config.currentValue)

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden p-5 space-y-5 ${className}`}>
      {/* Header: Title + Real-time Z-Score & Escalation Grade */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-sm text-neutral-900 tracking-tight">
              {title}
            </h3>
            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-bold border ${gradeInfo.badgeClass}`}>
              <Pulse className="w-3 h-3" weight="bold" />
              {gradeInfo.code}: {gradeInfo.label.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            {character ? (
              <strong className="text-neutral-700">{metricLabel}</strong>
            ) : (
              <span><strong className="text-neutral-700">{entityName}</strong> — {metricLabel}</span>
            )}
          </p>
        </div>

        {/* Current Metrics Pill */}
        <div className="flex items-center gap-4 font-mono text-xs">
          <div className="text-right">
            <span className="text-[10px] text-neutral-400 block uppercase">Current</span>
            <span className="font-bold text-neutral-900 text-sm">
              {config.formatValue(config.currentValue)}
            </span>
          </div>
          <div className="h-6 w-px bg-neutral-200" />
          <div className="text-right">
            <span className="text-[10px] text-neutral-400 block uppercase">Deviation</span>
            <span className="font-bold text-amber-700 text-sm">
              +{config.zScore.toFixed(2)}σ
            </span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Chart */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto select-none"
          style={{ minWidth: '480px' }}
        >
          <defs>
            <linearGradient id="coneGradient3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.12" />
            </linearGradient>
            <linearGradient id="coneGradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="coneGradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.18" />
            </linearGradient>
          </defs>

          {/* Grid lines (horizontal) */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = padding.top + innerHeight * frac
            const val = config.yMax - frac * (config.yMax - config.yMin)
            return (
              <g key={frac}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={padding.left + innerWidth}
                  y2={y}
                  stroke="#e5e5e5"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-neutral-400 font-mono text-[9px]"
                >
                  {config.formatValue(val)}
                </text>
              </g>
            )
          })}

          {/* 3-Sigma Confidence Band (Outermost Cone) */}
          <path d={pathCone3} fill="url(#coneGradient3)" />

          {/* 2-Sigma Confidence Band */}
          <path d={pathCone2} fill="url(#coneGradient2)" />

          {/* 1-Sigma Confidence Band (Innermost Cone) */}
          <path d={pathCone1} fill="url(#coneGradient1)" />

          {/* Rolling Mean Baseline */}
          <path
            d={pathMean}
            fill="none"
            stroke="#a3a3a3"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Critical Invariant Threshold Line */}
          <line
            x1={padding.left}
            y1={thresholdY}
            x2={padding.left + innerWidth}
            y2={thresholdY}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="6 3"
          />
          <text
            x={padding.left + innerWidth - 5}
            y={thresholdY - 6}
            textAnchor="end"
            className="fill-rose-700 font-mono font-bold text-[9px]"
          >
            {config.thresholdLabel}
          </text>

          {/* Current Block Horizon Dividing Line */}
          <line
            x1={currentX}
            y1={padding.top}
            x2={currentX}
            y2={padding.top + innerHeight}
            stroke="#171717"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <text
            x={currentX}
            y={padding.top - 6}
            textAnchor="middle"
            className="fill-neutral-900 font-mono font-bold text-[9px]"
          >
            NOW: #{formatBlockNumber(currentBlock)}
          </text>

          {/* Observed Historical Trajectory */}
          <path
            d={pathActual}
            fill="none"
            stroke="#171717"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Projected Forward Forecast Cone Drift */}
          <path
            d={pathProjected}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="1.8"
            strokeDasharray="4 3"
            strokeLinecap="round"
          />

          {/* Current Point Needle Pointer */}
          <circle
            cx={currentX}
            cy={currentY}
            r="6"
            fill="#f59e0b"
            fillOpacity="0.2"
          />
          <circle
            cx={currentX}
            cy={currentY}
            r="4.5"
            fill="#171717"
            stroke="#ffffff"
            strokeWidth="2"
          />

          {/* Interactive Tooltip / Data Scrubbing Points */}
          {chartData.map((pt) => {
            const cx = scaleX(pt.block)
            const cy = scaleY(pt.value)
            return (
              <circle
                key={pt.block}
                cx={cx}
                cy={cy}
                r="7"
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() =>
                  setHoveredPoint({
                    block: pt.block,
                    value: pt.value,
                    zScore: pt.zScore,
                    upper3: pt.upper3,
                    lower3: pt.lower3,
                  })
                }
                onMouseLeave={() => setHoveredPoint(null)}
              />
            )
          })}

          {/* X Axis Blocks */}
          <text
            x={padding.left}
            y={height - 10}
            textAnchor="start"
            className="fill-neutral-400 font-mono text-[9px]"
          >
            Start: #{formatBlockNumber(startBlock)}
          </text>
          <text
            x={padding.left + innerWidth}
            y={height - 10}
            textAnchor="end"
            className="fill-neutral-400 font-mono text-[9px]"
          >
            Deadline: #{formatBlockNumber(deadlineBlock)}
          </text>
        </svg>

        {/* Hover inspection pill */}
        {hoveredPoint && (
          <div className="absolute top-2 right-2 rounded-md bg-neutral-900/90 text-white px-2.5 py-1.5 font-mono text-[11px] shadow-lg backdrop-blur-sm space-y-0.5 pointer-events-none">
            <div className="flex items-center justify-between gap-3 text-[10px] text-neutral-400">
              <span>Block #{formatBlockNumber(hoveredPoint.block)}</span>
              <span className="text-amber-400 font-semibold">{hoveredPoint.zScore}σ</span>
            </div>
            <div className="font-bold">
              Value: {config.formatValue(hoveredPoint.value)}
            </div>
            <div className="text-[9px] text-neutral-400">
              3σ Band: [{config.formatValue(hoveredPoint.lower3)} .. {config.formatValue(hoveredPoint.upper3)}]
            </div>
          </div>
        )}
      </div>

      {/* Physics & Invariant Legend */}
      <div className="border-t border-neutral-100 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-600">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-neutral-900" />
            <span>Observed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-amber-500 border-b border-dashed border-amber-500" />
            <span>Projected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-emerald-100 border border-emerald-300" />
            <span>±1σ (68%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-amber-100 border border-amber-300" />
            <span>±2σ (95%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-rose-100 border border-rose-300" />
            <span>±3σ (99.7%)</span>
          </div>
        </div>

        <div className="text-[11px] text-neutral-500 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-neutral-400" />
          <span>2-block debounce</span>
        </div>
      </div>
    </div>
  )
}
