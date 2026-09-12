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
      subtitle="Conviction clusters across indexed on-chain state."
      breadcrumbs={[{ label: 'Oases' }, { label: 'Tension Casts' }]}
      actions={
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-mono text-neutral-700">
            <Radio className="w-4 h-4 text-neutral-900" weight="bold" />
            <span className="tabular-nums">{activeCount} Active</span>
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
      <div className="space-y-8 stagger-container">
        {/* Protocol Banner */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-neutral-300 transition-[border-color,box-shadow] duration-200 ease-out">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white shadow-inner">
                <Compass className="w-5 h-5" weight="bold" />
              </div>
              <div className="space-y-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  Protocol
                </p>
                <h3 className="text-sm font-semibold text-neutral-900 font-display tracking-tight text-balance">
                  Contagion Clusters & Forecast Bands
                </h3>
                <p className="text-xs text-neutral-500 leading-relaxed max-w-3xl text-pretty">
                  On-chain stress grouped into clusters. When an entity deviates from its forecast band,
                  child vaults open for conviction streaming.
                </p>
              </div>
            </div>

            <Link
              to="/characters"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-neutral-800 hover:text-neutral-950 self-start md:self-auto shrink-0 group transition-colors"
            >
              <span>Characters</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-500 group-hover:translate-x-1 group-hover:text-neutral-900 transition-[transform,color] duration-160 ease-out" />
            </Link>
          </div>
        </div>

        {/* Tension Casts Grid */}
        <div className="space-y-4">
          <h2 className="flex items-baseline gap-2.5 text-base font-semibold font-display tracking-tight text-neutral-900">
            Incidents
            <span className="font-mono text-[11px] font-medium text-neutral-400 tabular-nums">
              {tensionCasts.length} live
            </span>
          </h2>

          {tensionCasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 p-12 text-center bg-white">
              <ShieldWarning className="w-8 h-8 text-neutral-400 mb-2" />
              <p className="text-sm font-medium text-neutral-900">No Active Incidents</p>
              <p className="text-xs text-neutral-500 max-w-sm mt-1 text-pretty">
                All entities within nominal forecast bands.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 stagger-container">
              {tensionCasts.map((cast) => (
                <TensionCastCard key={cast.id} tensionCast={cast} />
              ))}
            </div>
          )}
        </div>

        {/* Pitch Feed */}
        <PitchFeed showDrawerCta={false} />

        {/* Detective Journal */}
        <JournalFeed
          title="Detective Stream"
          subtitle="AI monitoring health factors and invariant stability"
        />
      </div>

      <PitchDrawer
        isOpen={isPitchDrawerOpen}
        onClose={() => setIsPitchDrawerOpen(false)}
      />
    </TerminalShell>
  )
}
