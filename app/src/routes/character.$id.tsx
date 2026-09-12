import { useState, useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Database,
  Gauge,
  Lightning,
  ShieldCheck,
  Plus,
  Copy,
  Check,
  BracketsCurly,
  Pulse,
  Coins,
  HourglassHigh,
} from '@phosphor-icons/react'
import { TerminalShell } from '@/components/template/terminal-shell'
import { ClassBadge } from '@/components/molecules/class-badge'
import { AddressPill } from '@/components/molecules/address-pill'
import { StatusPill } from '@/components/molecules/status-pill'
import { Button } from '@/components/atoms/button'
import { useCharacter } from '@/hooks/use-characters'
import { useTensionCasts } from '@/hooks/use-tension-casts'
import { HurricaneCone } from '@/components/organisms/hurricane-cone'
import { PitchFeed } from '@/components/organisms/pitch-feed'
import { PitchDrawer } from '@/components/organisms/pitch-drawer'
import { formatUSDC, formatBlockNumber } from '@/utils/format-currency'

export const Route = createFileRoute('/character/$id')({
  component: CharacterDetailPage,
})

export function CharacterDetailPage() {
  const { id } = Route.useParams()
  const { character } = useCharacter(id)
  const { tensionCasts } = useTensionCasts()
  const [isPitchDrawerOpen, setIsPitchDrawerOpen] = useState(false)
  const [isQueryOpen, setIsQueryOpen] = useState(false)
  const [copiedQuery, setCopiedQuery] = useState(false)

  const queryTemplate = useMemo(() => {
    if (!character) return ''
    return `query GetEntityTelemetry($account: ID!, $block: Int!) {
  account(id: $account, block: { number: $block }) {
    id
    positions {
      ${character.primaryMetric}
      timestamp
    }
  }
}`
  }, [character])

  const handleCopyQuery = async () => {
    if (!queryTemplate) return
    try {
      await navigator.clipboard.writeText(queryTemplate)
      setCopiedQuery(true)
      setTimeout(() => setCopiedQuery(false), 2000)
    } catch {
      // fallback
    }
  }

  if (!character) {
    return (
      <TerminalShell
        title="Entity Not Found"
        breadcrumbs={[{ label: 'Characters', href: '/characters' }, { label: 'Not Found' }]}
      >
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center shadow-xs">
          <p className="text-sm font-medium text-neutral-900">Entity "{id}" not found.</p>
          <div className="mt-4">
            <Link to="/characters">
              <Button variant="outline" size="sm" className="font-mono text-xs gap-1.5 border-neutral-300">
                <ArrowLeft className="w-3.5 h-3.5" /> Characters
              </Button>
            </Link>
          </div>
        </div>
      </TerminalShell>
    )
  }

  // Find linked tension casts
  const linkedCasts = tensionCasts.filter(
    (tc) =>
      character.activeTensionCastIds?.includes(tc.id) ||
      tc.childVaults.some((v) => v.characterId === character.id)
  )

  return (
    <TerminalShell
      title={character.name}
      subtitle={character.description}
      breadcrumbs={[
        { label: 'Characters', href: '/characters' },
        { label: character.name },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <ClassBadge classType={character.classType} />
          {character.anomalyStatus && <StatusPill status={character.anomalyStatus} />}
          <Button
            type="button"
            size="sm"
            onClick={() => setIsPitchDrawerOpen(true)}
            className="bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs gap-1.5 h-8 font-semibold shadow-2xs transition-[background-color,transform,box-shadow] active:scale-[0.96] duration-160 ease-out"
          >
            <Plus className="w-3.5 h-3.5" weight="bold" />
            Pitch ($5)
          </Button>
        </div>
      }
    >
      <div className="space-y-6 stagger-container">
        {/* Precision Telemetry HUD (4 Pillar Data Bank) */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 stagger-container">
          {/* Card 1: Observed Invariant Value */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs interactive-card space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-neutral-500" />
              Observed
            </span>
            <div className="text-2xl font-bold font-mono text-neutral-900 tabular-nums">
              {character.currentMetricValue}
            </div>
            <span className="text-xs font-mono text-neutral-500 block truncate">
              <code className="font-semibold text-neutral-700 bg-neutral-100 px-1 py-0.5 rounded">{character.primaryMetric}</code>
            </span>
          </div>

          {/* Card 2: Anomaly State & Z-Score */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs interactive-card space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-neutral-400">
              <span className="flex items-center gap-1.5">
                <Pulse className="w-3.5 h-3.5 text-amber-500" />
                State
              </span>
              <span className="rounded bg-amber-50 border border-amber-200 px-1 py-0.5 text-[9px] font-semibold text-amber-700 tabular-nums">
                +2.41σ
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-neutral-900 pt-0.5 flex items-center gap-2">
              <span>{character.anomalyStatus || 'NOMINAL'}</span>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
            <span className="text-xs font-mono text-neutral-500 block">
              2-block debounce
            </span>
          </div>

          {/* Card 3: Target Contract / EOA */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs interactive-card space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-neutral-500" />
              Contract / EOA
            </span>
            <div className="pt-0.5">
              <AddressPill address={character.targetAddress} chars={6} />
            </div>
            <span className="text-xs font-mono text-neutral-500 block pt-0.5">
              Hedera EVM
            </span>
          </div>

          {/* Card 4: Subgraph Oracle */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs interactive-card space-y-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-neutral-500" />
              Subgraph
            </span>
            <div className="text-base font-semibold font-mono text-neutral-900 truncate" title={character.subgraphEndpoint}>
              Messari Standard
            </div>
            <span className="text-xs font-mono text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" weight="fill" />
              #20000142
            </span>
          </div>
        </div>

        {/* Hurricane Forecast Cone Centerpiece */}
        <HurricaneCone character={character} />

        {/* Asymmetric Command Matrix (7 Cols Left / 5 Cols Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (7 cols): Active Tension Casts & Subgraph Auditor */}
          <div className="lg:col-span-7 space-y-6">
            {/* Active Tension Casts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2">
                <h3 className="text-sm font-semibold font-display text-neutral-900 text-balance">
                  Active Tension Casts ({linkedCasts.length})
                </h3>
                <span className="text-xs font-mono text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200/60 tabular-nums">
                  {linkedCasts.length} active
                </span>
              </div>

              {linkedCasts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-8 text-center space-y-2 shadow-xs">
                  <p className="text-xs font-mono text-neutral-500">No active tension casts.</p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsPitchDrawerOpen(true)}
                    className="mt-2 bg-neutral-900 text-white font-mono text-xs gap-1.5 h-7"
                  >
                    <Plus className="w-3 h-3" /> Pitch
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 stagger-container">
                  {linkedCasts.map((cast) => {
                    const currentBlock = cast.currentBlock || 20000142
                    const totalBlocks = cast.deadlineBlock - cast.startBlock
                    const elapsed = Math.max(0, currentBlock - cast.startBlock)
                    const remaining = Math.max(0, cast.deadlineBlock - currentBlock)
                    const progressPct = Math.min(100, Math.round((elapsed / totalBlocks) * 100))

                    const totalPot = cast.childVaults.reduce(
                      (sum, v) => sum + v.seedPotUSDC + v.totalStreamedUSDC + (v.injectedYieldUSDC || 0),
                      0
                    )

                    return (
                      <Link
                        key={cast.id}
                        to="/tension-cast/$id"
                        params={{ id: cast.id }}
                        className="group block rounded-xl border border-neutral-200 bg-white p-5 transition-[border-color,box-shadow] duration-160 ease-out hover:border-neutral-400 hover:shadow-sm interactive-card no-underline space-y-3"
                      >
                        {/* Header: ID, Status, Pot */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold text-neutral-900 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded">
                              #{cast.id.replace('tc-', '').toUpperCase()}
                            </span>
                            <StatusPill status={cast.status} />
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <Coins className="w-3.5 h-3.5 text-emerald-600" weight="fill" />
                            <span className="text-neutral-500">Pot:</span>
                            <span className="font-bold text-neutral-900 tabular-nums">{formatUSDC(totalPot)}</span>
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h4 className="font-semibold text-base text-neutral-900 font-display group-hover:text-neutral-700 transition-colors text-balance">
                            {cast.title}
                          </h4>
                          <p className="text-xs text-neutral-600 font-sans line-clamp-1 mt-0.5 leading-relaxed text-pretty">
                            {cast.description}
                          </p>
                        </div>

                        {/* Horizon Progress Timeline */}
                        <div className="space-y-1.5 font-mono text-xs bg-neutral-50/70 border border-neutral-200/70 p-3 rounded-lg">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-neutral-500 flex items-center gap-1">
                              <HourglassHigh className="w-3 h-3 text-neutral-400" />
                              #{formatBlockNumber(cast.deadlineBlock)}
                            </span>
                            <span className="font-semibold text-neutral-900 tabular-nums">
                              {remaining} blocks left ({progressPct}%)
                            </span>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                            <div
                              className="h-full bg-neutral-900 rounded-full transition-[width] duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>

                        {/* Child Vault Targets & View CTA */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-100 text-xs font-mono">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {cast.childVaults.map((vault) => (
                              <span
                                key={vault.id}
                                className="rounded bg-neutral-100 border border-neutral-200/70 px-1.5 py-0.5 text-[10px] text-neutral-600 truncate max-w-[160px]"
                                title={vault.metricTarget}
                              >
                                {vault.metricTarget}
                              </span>
                            ))}
                          </div>

                          <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-neutral-900 group-hover:text-neutral-700 transition-colors">
                            View →
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Subgraph Query & State Proof Collapsible Drawer */}
            <div className="rounded-xl border border-neutral-200 bg-white shadow-xs overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-neutral-50/70 border-b border-neutral-100">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
                    <Lightning className="w-4 h-4" weight="bold" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold font-display text-neutral-900 text-balance">
                      State Proof
                    </h3>
                    <p className="text-xs text-neutral-500 font-mono">
                      Block #20000142 (2-block debounce)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyQuery}
                    className="h-7 text-xs font-mono gap-1 border-neutral-300 transition-[background-color,border-color,transform] active:scale-[0.96] duration-160 ease-out"
                  >
                    {copiedQuery ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsQueryOpen(!isQueryOpen)}
                    className="h-7 text-xs font-mono gap-1 border-neutral-300 transition-[background-color,border-color,transform] active:scale-[0.96] duration-160 ease-out"
                  >
                    <BracketsCurly className="w-3.5 h-3.5" weight="bold" />
                    {isQueryOpen ? 'Hide' : 'Inspect'}
                  </Button>
                </div>
              </div>

              {isQueryOpen && (
                <div className="p-4 bg-white border-t border-neutral-100 animate-in fade-in duration-160 ease-out">
                  <div className="rounded-lg bg-neutral-900 border border-neutral-800 p-4 font-mono text-xs overflow-x-auto text-emerald-400">
                    <pre className="leading-relaxed">
{queryTemplate}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): Pitch Feed */}
          <div className="lg:col-span-5 space-y-6">
            <PitchFeed
              characterIdFilter={character.id}
              showDrawerCta={true}
            />
          </div>
        </div>
      </div>

      {/* Anomaly Pitch Drawer */}
      <PitchDrawer
        isOpen={isPitchDrawerOpen}
        onClose={() => setIsPitchDrawerOpen(false)}
        defaultCharacterId={character.id}
      />
    </TerminalShell>
  )
}

