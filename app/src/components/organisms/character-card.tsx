import { Link } from '@tanstack/react-router'
import { ArrowRight, Gauge } from '@phosphor-icons/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/atoms/card'
import { ClassBadge } from '@/components/molecules/class-badge'
import { AddressPill } from '@/components/molecules/address-pill'
import { StatusPill } from '@/components/molecules/status-pill'
import type { ProtocolCharacter } from '@/types/character'

interface CharacterCardProps {
  character: ProtocolCharacter
}

export function CharacterCard({ character }: CharacterCardProps) {
  return (
    <Card
      className="interactive-card flex flex-col justify-between group bg-white border border-neutral-200 border-t-2 border-t-neutral-900 shadow-xs relative overflow-hidden"
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base font-semibold font-display text-neutral-900 leading-snug group-hover:text-neutral-950 transition-colors truncate text-balance">
              {character.name}
            </CardTitle>
            {character.subClass && (
              <span className="inline-block text-[10px] font-mono uppercase tracking-wider text-neutral-500 bg-neutral-100 border border-neutral-200/60 px-1.5 py-0.5 rounded">
                {character.subClass}
              </span>
            )}
          </div>
          <ClassBadge classType={character.classType} />
        </div>

        <CardDescription className="text-xs text-neutral-600 line-clamp-2 leading-relaxed text-pretty">
          {character.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        {/* Metric Telemetry Display */}
        <div className="rounded-lg border border-neutral-200/70 bg-neutral-50/70 p-2.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
            <span className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-neutral-400" />
              {character.primaryMetric}
            </span>
          </div>
          <div className="text-lg font-bold font-mono text-neutral-900 tabular-nums">
            {character.currentMetricValue}
          </div>
        </div>

        {/* Target Address & Anomaly Status */}
        <div className="space-y-1.5 font-mono text-xs pt-1">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-[11px]">Address:</span>
            <AddressPill address={character.targetAddress} chars={4} />
          </div>

          {character.anomalyStatus && (
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-neutral-500 text-[11px]">State:</span>
              <StatusPill status={character.anomalyStatus} />
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t border-neutral-100 bg-neutral-50/40">
        <Link
          to="/character/$id"
          params={{ id: character.id }}
          className="w-full inline-flex items-center justify-between text-xs font-mono font-medium text-neutral-800 group-hover:text-neutral-950 transition-colors no-underline"
        >
          <span className="flex items-center gap-1.5">
            Telemetry
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-900 group-hover:translate-x-1 transition-[color,transform] duration-160 ease-out" />
        </Link>
      </CardFooter>
    </Card>
  )
}
