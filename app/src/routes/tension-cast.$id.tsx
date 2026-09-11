import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Clock,
  Stack,
  Coins,
  Info,
  CheckCircle,
  Lightning,
} from '@phosphor-icons/react'
import { TerminalShell } from '@/components/template/terminal-shell'
import { StatusPill } from '@/components/molecules/status-pill'
import { ClassBadge } from '@/components/molecules/class-badge'
import { Button } from '@/components/atoms/button'
import { StreamForm } from '@/components/organisms/stream-form'
import { JournalFeed } from '@/components/organisms/journal-feed'
import { useTensionCast } from '@/hooks/use-tension-casts'
import { formatBlockNumber, formatUSDC } from '@/utils/format-currency'

export const Route = createFileRoute('/tension-cast/$id')({
  component: TensionCastDetailPage,
})

function TensionCastDetailPage() {
  const { id } = Route.useParams()
  const { tensionCast } = useTensionCast(id)

  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null)

  if (!tensionCast) {
    return (
      <TerminalShell
        title="Tension Cast Not Found"
        breadcrumbs={[
          { label: 'Oases', href: '/home' },
          { label: 'Tension Casts', href: '/home' },
          { label: 'Unknown' },
        ]}
      >
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-neutral-900">
            Tension Cast "{id}" could not be located.
          </p>
          <div className="mt-4">
            <Link to="/home">
              <Button variant="outline" size="sm" className="font-mono text-xs gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Return to Active Casts
              </Button>
            </Link>
          </div>
        </div>
      </TerminalShell>
    )
  }

  // Active selected child vault
  const activeVault =
    tensionCast.childVaults.find((v) => v.id === selectedVaultId) ??
    tensionCast.childVaults[0]

  return (
    <TerminalShell
      title={tensionCast.title}
      subtitle={tensionCast.description}
      breadcrumbs={[
        { label: 'Oases', href: '/home' },
        { label: 'Tension Casts', href: '/home' },
        { label: tensionCast.title },
      ]}
      actions={
        <div className="flex items-center gap-2.5">
          <StatusPill status={tensionCast.status} />
        </div>
      }
    >
      <div className="space-y-8">
        {/* Directive Telemetry Header */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              Incident Block Horizon
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900">
              #{formatBlockNumber(tensionCast.startBlock)} → #{formatBlockNumber(tensionCast.deadlineBlock)}
            </p>
            <span className="text-[11px] font-mono text-neutral-400">
              {tensionCast.deadlineBlock - tensionCast.startBlock} Blocks Timebox
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Stack className="w-3.5 h-3.5 text-neutral-400" />
              Contagion Cluster
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900">
              {tensionCast.childVaults.length} Child Conviction Vaults
            </p>
            <span className="text-[11px] font-mono text-emerald-700 font-medium">
              Open Multi-Vault Set
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-neutral-400" />
              Protocol Seed Base
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900">
              $20.00 USDC Seed / Vault
            </p>
            <span className="text-[11px] font-mono text-neutral-500">
              $10 YES / $10 NO Primed
            </span>
          </div>
        </div>

        {/* Child Conviction Vaults Cluster Grid */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold font-display text-neutral-900">
                Select Child Conviction Vault ({tensionCast.childVaults.length})
              </h2>
              <p className="text-xs text-neutral-500">
                Click any vault to direct your continuous capital stream into its bonding curve.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-md border border-neutral-200">
              <Info className="w-3.5 h-3.5 text-neutral-500" />
              <span>Base Price P₀ = $0.100 USDC</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {tensionCast.childVaults.map((vault) => {
              const isSelected = vault.id === activeVault?.id
              return (
                <div
                  key={vault.id}
                  onClick={() => setSelectedVaultId(vault.id)}
                  className={`group cursor-pointer rounded-xl border p-4 transition-all ${
                    isSelected
                      ? 'border-neutral-900 bg-neutral-50/70 shadow-md ring-1 ring-neutral-900'
                      : 'border-neutral-200 bg-white hover:border-neutral-400 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <ClassBadge classType={vault.classType} />
                    <div className="flex items-center gap-1.5">
                      {isSelected && (
                        <span className="flex items-center gap-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-mono text-white font-medium">
                          <CheckCircle className="w-3 h-3 text-emerald-400" weight="fill" />
                          SELECTED
                        </span>
                      )}
                      <StatusPill status={vault.status} />
                    </div>
                  </div>

                  <Link
                    to="/character/$id"
                    params={{ id: vault.characterId }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs font-mono text-neutral-500 hover:text-neutral-900 transition-colors"
                  >
                    Target: {vault.characterName}
                  </Link>

                  <h3 className="text-sm font-semibold text-neutral-900 font-display mt-1 leading-snug">
                    {vault.question}
                  </h3>

                  <div className="mt-3 rounded-md bg-white border border-neutral-200 p-2 font-mono text-[11px] space-y-0.5">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                      Breach Invariant Gate
                    </span>
                    <span className="font-semibold text-neutral-800">
                      {vault.metricTarget}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-neutral-100">
                    <div>
                      <span className="text-neutral-400 text-[10px]">Nominal Seed</span>
                      <p className="font-medium text-neutral-900">{formatUSDC(vault.seedPotUSDC)}</p>
                    </div>
                    <div>
                      <span className="text-neutral-400 text-[10px]">Total Streamed</span>
                      <p className="font-semibold text-emerald-700">{formatUSDC(vault.totalStreamedUSDC)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected Child Vault Stream Form Section */}
        {activeVault && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightning className="w-4 h-4 text-amber-600" weight="fill" />
              <h3 className="font-display font-semibold text-sm text-neutral-900">
                Streaming Target: {activeVault.characterName} — {activeVault.question}
              </h3>
            </div>
            <StreamForm
              vault={activeVault}
              marketId={tensionCast.marketId}
            />
          </div>
        )}

        {/* Live Detective Thought Journal Section */}
        <div className="space-y-3">
          <JournalFeed
            title="Incident Detective Reasoning Stream"
            subtitle={`Real-time Mastra AI detective thought stream monitoring ${tensionCast.title}`}
          />
        </div>
      </div>
    </TerminalShell>
  )
}
