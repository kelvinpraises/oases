import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Clock,
  Stack,
  Coins,
  Lightning,
  Plus,
} from '@phosphor-icons/react'
import { TerminalShell } from '@/components/template/terminal-shell'
import { StatusPill } from '@/components/molecules/status-pill'
import { Button } from '@/components/atoms/button'
import { StreamForm } from '@/components/organisms/stream-form'
import { JournalFeed } from '@/components/organisms/journal-feed'
import { YieldHUD } from '@/components/organisms/yield-hud'
import { TicketAuditor } from '@/components/organisms/ticket-auditor'
import { ClaimModal } from '@/components/organisms/claim-modal'
import { ContagionArc } from '@/components/organisms/contagion-arc'
import { HurricaneCone } from '@/components/organisms/hurricane-cone'
import { PitchDrawer } from '@/components/organisms/pitch-drawer'
import { PitchFeed } from '@/components/organisms/pitch-feed'
import { useTensionCast } from '@/hooks/use-tension-casts'
import { formatBlockNumber } from '@/utils/format-currency'

export const Route = createFileRoute('/tension-cast/$id')({
  component: TensionCastDetailPage,
})

function TensionCastDetailPage() {
  const { id } = Route.useParams()
  const { tensionCast } = useTensionCast(id)

  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null)
  const [isPitchDrawerOpen, setIsPitchDrawerOpen] = useState<boolean>(false)

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
      <div className="space-y-8 stagger-container">
        {/* Directive Telemetry Header */}
        <div className="grid gap-4 sm:grid-cols-3 stagger-container">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs interactive-card">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              Block Horizon
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900 tabular-nums">
              #{formatBlockNumber(tensionCast.startBlock)} → #{formatBlockNumber(tensionCast.deadlineBlock)}
            </p>
            <span className="text-[11px] font-mono text-neutral-400">
              {tensionCast.deadlineBlock - tensionCast.startBlock} Blocks
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs interactive-card">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Stack className="w-3.5 h-3.5 text-neutral-400" />
              Contagion Cluster
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900">
              {tensionCast.childVaults.length} Child Vaults
            </p>
            <span className="text-[11px] font-mono text-emerald-700 font-medium">
              Multi-Vault Cluster
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs interactive-card">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-neutral-400" />
              Protocol Seed
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900">
              $20.00 Seed / Vault
            </p>
            <span className="text-[11px] font-mono text-neutral-500">
              $10 YES / $10 NO
            </span>
          </div>
        </div>

        {/* Systemic Contagion Arc Cluster Visualizer */}
        <ContagionArc
          tensionCast={tensionCast}
          selectedVaultId={activeVault?.id}
          onSelectVault={(vId) => setSelectedVaultId(vId)}
        />

        {/* Selected Child Vault Section */}
        {activeVault && (
          <div className="space-y-6 stagger-container">
            {/* 1. Hurricane Forecast Cone & Trajectory Geometry */}
            <HurricaneCone
              vault={activeVault}
              currentBlock={tensionCast.currentBlock}
              startBlock={tensionCast.startBlock}
              deadlineBlock={tensionCast.deadlineBlock}
            />

            {/* 2. Positive-Sum Yield HUD */}
            <YieldHUD vault={activeVault} />

            {/* 3. Settlement & Claim Station */}
            <ClaimModal vault={activeVault} tensionCast={tensionCast} />

            {/* 3. Streaming Configuration */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lightning className="w-4 h-4 text-amber-600" weight="fill" />
                  <h3 className="font-display font-semibold text-sm text-neutral-900">
                    {activeVault.characterName} — {activeVault.question}
                  </h3>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => setIsPitchDrawerOpen(true)}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs gap-1.5 h-8 font-semibold shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" weight="bold" />
                  Pitch Anomaly ($5)
                </Button>
              </div>

              <StreamForm
                vault={activeVault}
                marketId={tensionCast.marketId}
              />
            </div>

            {/* 4. Replay Ticket Auditor & Proof Inspector */}
            <TicketAuditor vault={activeVault} />
          </div>
        )}

        {/* Live Pitch Activity Feed Ticker */}
        <div className="space-y-3">
          <PitchFeed
            characterIdFilter={activeVault?.characterId}
            limit={5}
            showDrawerCta={false}
          />
        </div>

        {/* Live Detective Thought Journal Section */}
        <div className="space-y-3">
          <JournalFeed
            title="Detective Thought Stream"
            subtitle={`Mastra AI telemetry reasoning for ${tensionCast.title}`}
          />
        </div>
      </div>

      {/* Anomaly Pitch Drawer */}
      <PitchDrawer
        isOpen={isPitchDrawerOpen}
        onClose={() => setIsPitchDrawerOpen(false)}
        defaultCharacterId={activeVault?.characterId}
      />
    </TerminalShell>
  )
}
