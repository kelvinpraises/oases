import { useState, useRef, useEffect } from 'react'
import {
  TerminalWindow,
  Brain,
  WarningCircle,
  CheckCircle,
  Info,
} from '@phosphor-icons/react'
import { useJournalStream } from '@/hooks/use-journal-stream'
import type { JournalLevel } from '@/types/journal'

interface JournalFeedProps {
  title?: string
  subtitle?: string
  maxHeight?: string
  className?: string
}

export function JournalFeed({
  title = 'Detective Reasoning Journal',
  subtitle = 'Mastra AI Detective live stream analyzing on-chain invariants and entity telemetry',
  maxHeight = 'max-h-[480px]',
  className = '',
}: JournalFeedProps) {
  const { entries, isConnected, filterLevel, setFilterLevel } = useJournalStream()
  const [autoScroll, setAutoScroll] = useState<boolean>(true)
  const feedEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (autoScroll && feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, autoScroll])

  const getLevelBadge = (level: JournalLevel) => {
    switch (level) {
      case 'ANOMALY':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-800 border border-amber-200">
            <WarningCircle className="w-3 h-3 text-amber-600" weight="bold" />
            ANOMALY
          </span>
        )
      case 'ALERT':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-800 border border-rose-200">
            <WarningCircle className="w-3 h-3 text-rose-600" weight="fill" />
            ALERT
          </span>
        )
      case 'RESOLUTION':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3 text-emerald-600" weight="bold" />
            RESOLVED
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-0.5 font-mono text-[10px] font-medium text-neutral-700 border border-neutral-200">
            <Info className="w-3 h-3 text-neutral-500" weight="bold" />
            INFO
          </span>
        )
    }
  }

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden flex flex-col ${className}`}>
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <TerminalWindow className="w-4 h-4" weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-sm text-neutral-900 tracking-tight">
                {title}
              </h3>
              <div className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2 py-0.5 font-mono text-[10px]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'
                  }`}
                />
                <span className="text-neutral-600">
                  {isConnected ? 'LIVE HARNESS' : 'BUFFERED FEED'}
                </span>
              </div>
            </div>
            <p className="text-xs text-neutral-500">{subtitle}</p>
          </div>
        </div>

        {/* Filter pills & controls */}
        <div className="flex items-center gap-1.5">
          {(['ALL', 'ANOMALY', 'ALERT', 'INFO'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilterLevel(lvl)}
              className={`rounded px-2 py-1 font-mono text-[10px] font-medium transition-colors ${
                filterLevel === lvl
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
              }`}
            >
              {lvl}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={`rounded px-2 py-1 font-mono text-[10px] font-medium border transition-colors ${
              autoScroll
                ? 'border-neutral-300 bg-neutral-100 text-neutral-900 font-semibold'
                : 'border-neutral-200 bg-white text-neutral-400'
            }`}
            title="Toggle autoscroll to latest thought"
          >
            Auto: {autoScroll ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Feed list */}
      <div className={`overflow-y-auto divide-y divide-neutral-100 p-3 space-y-2.5 ${maxHeight}`}>
        {entries.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-neutral-400">
            No journal entries matching filter.
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-neutral-100 bg-neutral-50/40 p-3 text-xs transition-colors hover:bg-neutral-50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  {getLevelBadge(entry.level)}
                  <span className="font-mono text-[11px] font-medium text-neutral-500">
                    [{entry.source}]
                  </span>
                  {entry.blockNumber && (
                    <span className="font-mono text-[10px] text-neutral-400">
                      #{entry.blockNumber}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {entry.metricValue && (
                    <span className="font-mono text-[10px] font-semibold text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">
                      {entry.metricValue}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-neutral-400">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>
              </div>

              {/* Thought prose */}
              <p className="font-sans text-xs text-neutral-800 leading-relaxed font-normal">
                {entry.thought}
              </p>

              {/* Confidence meter */}
              <div className="mt-2 flex items-center justify-between pt-1 border-t border-neutral-200/50 text-[10px] font-mono text-neutral-400">
                <div className="flex items-center gap-1.5">
                  <Brain className="w-3 h-3 text-neutral-500" />
                  <span>Agent Confidence:</span>
                  <span className="font-semibold text-neutral-700">
                    {(entry.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-24 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    className="h-full bg-neutral-900 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, entry.confidenceScore * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={feedEndRef} />
      </div>
    </div>
  )
}
