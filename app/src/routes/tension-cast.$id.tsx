import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Clock,
  Stack,
  Coins,
  Lightning,
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
import { useTensionCast } from '@/hooks/use-tension-casts'
import { formatBlockNumber } from '@/utils/format-currency'

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

        {/* Systemic Contagion Arc Cluster Visualizer */}
        <ContagionArc
          tensionCast={tensionCast}
          selectedVaultId={activeVault?.id}
          onSelectVault={(vId) => setSelectedVaultId(vId)}
        />

        {/* Selected Child Vault Section */}
        {activeVault && (
          <div className="space-y-6">
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

            {/* 4. Replay Ticket Auditor & Proof Inspector */}
            <TicketAuditor vault={activeVault} />
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
