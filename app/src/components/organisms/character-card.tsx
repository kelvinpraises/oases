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
    <Card className="hover:border-neutral-400 transition-all duration-150 flex flex-col justify-between">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base font-semibold font-display text-neutral-900 leading-snug">
              {character.name}
            </CardTitle>
            {character.subClass && (
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                {character.subClass}
              </span>
            )}
          </div>
          <ClassBadge classType={character.classType} />
        </div>
        <CardDescription className="text-xs text-neutral-600 line-clamp-2">
          {character.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-neutral-500">Address:</span>
          <AddressPill address={character.targetAddress} chars={4} />
        </div>

        <div className="flex items-center justify-between text-xs font-mono border-t border-neutral-100 pt-2">
          <span className="flex items-center gap-1 text-neutral-500">
            <Gauge className="w-3.5 h-3.5" />
            {character.primaryMetric}:
          </span>
          <span className="font-semibold text-neutral-900 bg-neutral-100 px-1.5 py-0.5 rounded">
            {character.currentMetricValue}
          </span>
        </div>

        {character.anomalyStatus && (
          <div className="flex items-center justify-between text-xs font-mono pt-1">
            <span className="text-neutral-500">State Band:</span>
            <StatusPill status={character.anomalyStatus} />
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 border-t border-neutral-100">
        <Link
          to="/character/$id"
          params={{ id: character.id }}
          className="w-full inline-flex items-center justify-between text-xs font-mono font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
        >
          <span>View Telemetry Detail</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardFooter>
    </Card>
  )
}
