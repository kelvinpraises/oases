import { Link } from '@tanstack/react-router'
import { ArrowRight, Stack, Clock } from '@phosphor-icons/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/atoms/card'
import { StatusPill } from '@/components/molecules/status-pill'
import { ClassBadge } from '@/components/molecules/class-badge'
import type { TensionCast } from '@/types/tension-cast'
import { formatBlockNumber } from '@/utils/format-currency'

interface TensionCastCardProps {
  tensionCast: TensionCast
}

export function TensionCastCard({ tensionCast }: TensionCastCardProps) {
  return (
    <Card className="hover:border-neutral-400 transition-all duration-150 flex flex-col justify-between">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold font-display text-neutral-900 leading-snug">
            {tensionCast.title}
          </CardTitle>
          <StatusPill status={tensionCast.status} />
        </div>
        <CardDescription className="text-xs text-neutral-600 line-clamp-2">
          {tensionCast.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-xs font-mono text-neutral-600 border-t border-b border-neutral-100 py-2">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            Horizon:
          </span>
          <span className="font-semibold text-neutral-800">
            #{formatBlockNumber(tensionCast.startBlock)} → #{formatBlockNumber(tensionCast.deadlineBlock)}
          </span>
        </div>

        {/* Linked child vaults preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
            <span className="flex items-center gap-1">
              <Stack className="w-3 h-3" />
              Contagion Cluster
            </span>
            <span>{tensionCast.childVaults.length} Child Vaults</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {tensionCast.childVaults.map((vault) => (
              <ClassBadge key={vault.id} classType={vault.classType} />
            ))}
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-2 border-t border-neutral-100">
        <Link
          to="/tension-cast/$id"
          params={{ id: tensionCast.id }}
          className="w-full inline-flex items-center justify-between text-xs font-mono font-medium text-neutral-900 hover:text-neutral-600 transition-colors"
        >
          <span>Open Tension Cast</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardFooter>
    </Card>
  )
}
