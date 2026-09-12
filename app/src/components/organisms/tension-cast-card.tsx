import { Link } from '@tanstack/react-router'
import { ArrowRight, Clock, Coins } from '@phosphor-icons/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/atoms/card'
import { StatusPill } from '@/components/molecules/status-pill'
import type { TensionCast } from '@/types/tension-cast'
import { formatBlockNumber, formatUSDC } from '@/utils/format-currency'

interface TensionCastCardProps {
  tensionCast: TensionCast
}

export function TensionCastCard({ tensionCast }: TensionCastCardProps) {
  // Aggregate nominal seed + injected pitch yield across cluster
  const totalClusterPot = tensionCast.childVaults.reduce(
    (acc, v) => acc + (v.seedPotUSDC || 20) + (v.injectedYieldUSDC || 0),
    0
  )

  return (
    <Card className="interactive-card flex flex-col justify-between group bg-white border border-neutral-200">
      <CardHeader className="space-y-3 pb-3">
        {/* Top metadata strip: Directive ID + Status */}
        <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-900" />
            <span className="font-semibold text-neutral-700 uppercase">CAST #{tensionCast.id.slice(0, 8)}</span>
          </div>
          <StatusPill status={tensionCast.status} />
        </div>

        <div className="space-y-1.5">
          <CardTitle className="text-base sm:text-lg font-bold font-display text-neutral-900 leading-snug group-hover:text-neutral-950 transition-colors">
            {tensionCast.title}
          </CardTitle>
          <CardDescription className="text-xs text-neutral-600 line-clamp-2 leading-relaxed text-pretty">
            {tensionCast.description}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-3.5 pt-0">
        {/* Horizon and Prize Pot metrics */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-2.5 text-xs font-mono">
          <div>
            <span className="text-[10px] uppercase text-neutral-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-neutral-400" />
              Horizon
            </span>
            <div className="font-semibold text-neutral-800 mt-0.5 tabular-nums text-[11px]">
              #{formatBlockNumber(tensionCast.startBlock)} → #{formatBlockNumber(tensionCast.deadlineBlock)}
            </div>
          </div>

          <div className="border-l border-neutral-200 pl-2.5">
            <span className="text-[10px] uppercase text-neutral-400 flex items-center gap-1">
              <Coins className="w-3 h-3 text-neutral-500" />
              Pot
            </span>
            <div className="font-bold text-neutral-800 mt-0.5 tabular-nums text-xs">
              {formatUSDC(totalClusterPot)}
            </div>
          </div>
        </div>

      </CardContent>

      <CardFooter className="pt-3 border-t border-neutral-100 bg-neutral-50/40 rounded-b-xl">
        <Link
          to="/tension-cast/$id"
          params={{ id: tensionCast.id }}
          className="w-full inline-flex items-center justify-between text-xs font-mono font-semibold text-neutral-800 group-hover:text-neutral-950 transition-colors"
        >
          <span>Stream</span>
          <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:translate-x-1 group-hover:text-neutral-900 transition-[transform,color] duration-160 ease-out" />
        </Link>
      </CardFooter>
    </Card>
  )
}
