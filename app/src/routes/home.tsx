import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Radio, Compass, ShieldWarning, ArrowRight, Plus } from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import { TerminalShell } from '@/components/template/terminal-shell'
import { TensionCastCard } from '@/components/organisms/tension-cast-card'
import { JournalFeed } from '@/components/organisms/journal-feed'
import { PitchFeed } from '@/components/organisms/pitch-feed'
import { PitchDrawer } from '@/components/organisms/pitch-drawer'
import { useTensionCasts } from '@/hooks/use-tension-casts'

export const Route = createFileRoute('/home')({
  component: HomePage,
})

function HomePage() {
  const { tensionCasts, activeCount } = useTensionCasts()
  const [isPitchDrawerOpen, setIsPitchDrawerOpen] = useState(false)

  return (
    <TerminalShell
      title="Active Tension Casts"
      subtitle="Source Directives coordinating multi-vault conviction markets over indexed Ethereum state space."
      breadcrumbs={[{ label: 'Oases' }, { label: 'Tension Casts' }]}
      actions={
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-mono text-neutral-700">
            <Radio className="w-4 h-4 text-emerald-600 animate-pulse" weight="bold" />
            <span>{activeCount} Active Directives</span>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => setIsPitchDrawerOpen(true)}
            className="bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs gap-1.5 h-8 font-semibold shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" weight="bold" />
            Pitch Anomaly
          </Button>
        </div>
      }
    >
      <div className="space-y-8">
        {/* Protocol Context Banner */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-800">
                <Compass className="w-5 h-5" weight="bold" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-neutral-900 font-display">
                  Hurricane Forecast Cones for Live Financial Physics
                </h3>
                <p className="text-xs text-neutral-600 leading-relaxed max-w-3xl">
                  Tension Casts group correlated on-chain stress into contagion clusters. When an Actor or Bond
                  deviates from its rolling forecast band, child conviction vaults open for continuous capital streaming.
                </p>
              </div>
            </div>

            <Link
              to="/characters"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-neutral-900 hover:text-neutral-600 self-start md:self-auto shrink-0"
            >
              <span>Explore Character Taxonomy</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Tension Casts Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold font-display text-neutral-900">
              Monitored Incidents ({tensionCasts.length})
            </h2>
            <span className="text-xs font-mono text-neutral-500">
              Live Horizon Timeboxes
            </span>
          </div>

          {tensionCasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 p-12 text-center bg-white">
              <ShieldWarning className="w-8 h-8 text-neutral-400 mb-2" />
              <p className="text-sm font-medium text-neutral-900">No Active Tension Casts</p>
              <p className="text-xs text-neutral-500 max-w-sm mt-1">
                All protocol entities are operating within nominal baseline forecast bands (Grade G0).
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {tensionCasts.map((cast) => (
                <TensionCastCard key={cast.id} tensionCast={cast} />
              ))}
            </div>
          )}
        </div>

        {/* Live Pitch Activity Feed Ticker */}
        <div className="space-y-4">
          <PitchFeed />
        </div>

        {/* Global Live Detective Reasoning Terminal */}
        <div className="space-y-4">
          <JournalFeed
            title="Global Protocol Detective Stream"
            subtitle="Autonomous Mastra AI agent actively monitoring health factors, liquidity reserves, and invariant stability"
          />
        </div>
      </div>

      {/* Anomaly Pitch Drawer */}
      <PitchDrawer
        isOpen={isPitchDrawerOpen}
        onClose={() => setIsPitchDrawerOpen(false)}
      />
    </TerminalShell>
  )
}
