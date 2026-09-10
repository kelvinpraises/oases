import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Clock,
  Stack,
  Coins,
  ShieldCheck,
  Info,
} from '@phosphor-icons/react'
import { TerminalShell } from '@/components/template/terminal-shell'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/atoms/card'
import { StatusPill } from '@/components/molecules/status-pill'
import { ClassBadge } from '@/components/molecules/class-badge'
import { Button } from '@/components/atoms/button'
import { useTensionCast } from '@/hooks/use-tension-casts'
import { formatBlockNumber, formatUSDC } from '@/utils/format-currency'

export const Route = createFileRoute('/tension-cast/$id')({
  component: TensionCastDetailPage,
})

function TensionCastDetailPage() {
  const { id } = Route.useParams()
  const { tensionCast } = useTensionCast(id)

  if (!tensionCast) {
    return (
      <TerminalShell
        title="Tension Cast Not Found"
        breadcrumbs={[{ label: 'Oases', href: '/home' }, { label: 'Tension Casts', href: '/home' }, { label: 'Unknown' }]}
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
          <div className="rounded-xl border border-neutral-200 bg-white p-4">
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

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Stack className="w-3.5 h-3.5 text-neutral-400" />
              Contagion Cluster
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900">
              {tensionCast.childVaults.length} Child Conviction Vaults
            </p>
            <span className="text-[11px] font-mono text-emerald-600">
              Open Set (Actor, Place, Bond)
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5 text-neutral-400" />
              Protocol Seed Base
            </span>
            <p className="mt-1 text-sm font-mono font-bold text-neutral-900">
              $20.00 USDC Seed / Vault
            </p>
            <span className="text-[11px] font-mono text-neutral-500">
              $10 YES / $10 NO Genesis
            </span>
          </div>
        </div>

        {/* Child Conviction Vaults Cluster Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold font-display text-neutral-900">
                Child Conviction Vaults ({tensionCast.childVaults.length})
              </h2>
              <p className="text-xs text-neutral-500">
                Independent continuous bonding curves evaluating correlated points of systemic failure.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-mono text-neutral-500">
              <Info className="w-3.5 h-3.5" />
              <span>Base Price P0 = 0.50 USDC</span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {tensionCast.childVaults.map((vault) => (
              <Card key={vault.id} className="flex flex-col justify-between hover:border-neutral-400 transition-colors">
                <CardHeader className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <ClassBadge classType={vault.classType} />
                    <StatusPill status={vault.status} />
                  </div>

                  <div>
                    <Link
                      to="/character/$id"
                      params={{ id: vault.characterId }}
                      className="text-xs font-mono text-neutral-500 hover:text-neutral-900 transition-colors"
                    >
                      Target: {vault.characterName}
                    </Link>
                    <CardTitle className="text-sm font-semibold text-neutral-900 font-display mt-1 leading-snug">
                      {vault.question}
                    </CardTitle>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="rounded-md bg-neutral-50 border border-neutral-200 p-2.5 font-mono text-xs space-y-1">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider block">
                      Breach Invariant Gate
                    </span>
                    <span className="font-semibold text-neutral-800">
                      {vault.metricTarget}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                    <div className="space-y-0.5">
                      <span className="text-neutral-400 text-[10px]">Seed Pot (P0)</span>
                      <p className="font-medium text-neutral-900">{formatUSDC(vault.seedPotUSDC)}</p>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-neutral-400 text-[10px]">Streamed Capital</span>
                      <p className="font-semibold text-emerald-700">{formatUSDC(vault.totalStreamedUSDC)}</p>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="border-t border-neutral-100 pt-3">
                  <div className="w-full flex items-center justify-between text-xs font-mono">
                    <span className="text-neutral-400 text-[11px]">Drips Stream Ready</span>
                    <span className="text-neutral-800 font-medium">Flow 2 Engine</span>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>

        {/* Cold Start Resolution Info */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-2">
          <h4 className="text-xs font-mono font-semibold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-neutral-700" />
            Continuous Conviction Market Mechanics
          </h4>
          <p className="text-xs text-neutral-600 leading-relaxed max-w-4xl">
            Child vaults are initialized via nominal protocol seeding ($20 USDC) at $P_0 = 0.50$.
            Capital streams continuously via Solady FixedPointMathLib continuous logarithmic area integrals (<code>lnWad</code>).
            Zero deadlocks: Early alpha discovery is fully rewarded from genesis.
          </p>
        </div>
      </div>
    </TerminalShell>
  )
}
