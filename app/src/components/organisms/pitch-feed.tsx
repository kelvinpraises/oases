import { useState } from 'react'
import {
  Lightning,
  Clock,
  Plus,
} from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import { PitchDrawer } from '@/components/organisms/pitch-drawer'
import { usePitches } from '@/hooks/use-pitches'
import { formatAddress } from '@/utils/format-address'
import { formatUSDC } from '@/utils/format-currency'

interface PitchFeedProps {
  className?: string
  limit?: number
  characterIdFilter?: string
  showDrawerCta?: boolean
}

export function PitchFeed({
  className = '',
  limit,
  characterIdFilter,
  showDrawerCta = true,
}: PitchFeedProps) {
  const { pitches, totalPitchYieldUSDC } = usePitches()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const filteredPitches = pitches
    .filter((p) => !characterIdFilter || p.characterId === characterIdFilter)
    .slice(0, limit || pitches.length)

  const formatTimeAgo = (timestamp: number) => {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`
    const mins = Math.floor(elapsedSeconds / 60)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4 ${className}`}>
      {/* Feed Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-800 font-mono text-xs font-bold">
              ⚡
            </span>
            <h3 className="font-display font-semibold text-base text-neutral-900 tracking-tight">
              Live Pitch Activity Feed
            </h3>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-800">
              +{formatUSDC(totalPitchYieldUSDC)} INJECTED
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-sans mt-0.5">
            Decentralized anomaly proposals injecting 80% protocol yield into Tension Cast prize pools
          </p>
        </div>

        {showDrawerCta && (
          <Button
            type="button"
            size="sm"
            onClick={() => setIsDrawerOpen(true)}
            className="bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs gap-1.5 h-8 font-semibold shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" weight="bold" />
            Pitch Anomaly
          </Button>
        )}
      </div>

      {/* Feed Cards List */}
      <div className="space-y-3">
        {filteredPitches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 p-6 text-center text-xs text-neutral-500 font-mono">
            No anomaly pitches submitted for this entity yet. Be the first to inject yield.
          </div>
        ) : (
          filteredPitches.map((pitch) => (
            <div
              key={pitch.id}
              className="rounded-lg border border-neutral-200 bg-neutral-50/60 p-3.5 hover:border-neutral-300 transition-colors space-y-2.5"
            >
              {/* Card Meta Top */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-neutral-900 bg-white border border-neutral-200 px-2 py-0.5 rounded text-[11px]">
                    {formatAddress(pitch.submitter, 4)}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">targeted</span>
                  <span className="font-semibold text-neutral-800 text-[11px]">
                    {pitch.characterName}
                  </span>
                </div>

                {/* Status Yield Badge */}
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 flex items-center gap-1">
                    <Lightning className="w-3 h-3 text-emerald-600" weight="fill" />
                    +${pitch.potYieldUSDC.toFixed(2)} YIELD INJECTED
                  </span>
                  <span className="font-mono text-[10px] text-neutral-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(pitch.timestamp)}
                  </span>
                </div>
              </div>

              {/* Thesis Statement */}
              <p className="text-xs text-neutral-800 font-sans leading-relaxed font-medium">
                "{pitch.thesis}"
              </p>

              {/* Card Meta Bottom Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-200/60 text-[11px] font-mono text-neutral-500">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-white border border-neutral-200 px-1.5 py-0.5 text-[10px]">
                    Key: <strong className="text-neutral-700">{pitch.metricKey}</strong>
                  </span>
                  <span className="rounded bg-white border border-neutral-200 px-1.5 py-0.5 text-[10px]">
                    Window: <strong className="text-neutral-700">{pitch.evaluationTimebox} blocks</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-neutral-400">
                    Gas Reserve: $1.00 USDC
                  </span>
                  {pitch.txHash && (
                    <span className="text-[10px] font-mono text-neutral-400">
                      tx: {pitch.txHash.slice(0, 8)}...
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Drawer Slide-out Sheet */}
      <PitchDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        defaultCharacterId={characterIdFilter}
      />
    </div>
  )
}
