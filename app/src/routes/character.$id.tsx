import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Database,
  Gauge,
  Lightning,
  ShieldCheck,
} from '@phosphor-icons/react'
import { TerminalShell } from '@/components/template/terminal-shell'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms/card'
import { ClassBadge } from '@/components/molecules/class-badge'
import { AddressPill } from '@/components/molecules/address-pill'
import { StatusPill } from '@/components/molecules/status-pill'
import { Button } from '@/components/atoms/button'
import { useCharacter } from '@/hooks/use-characters'
import { useTensionCasts } from '@/hooks/use-tension-casts'

export const Route = createFileRoute('/character/$id')({
  component: CharacterDetailPage,
})

function CharacterDetailPage() {
  const { id } = Route.useParams()
  const { character } = useCharacter(id)
  const { tensionCasts } = useTensionCasts()

  if (!character) {
    return (
      <TerminalShell
        title="Entity Not Found"
        breadcrumbs={[{ label: 'Oases', href: '/home' }, { label: 'Characters', href: '/characters' }, { label: 'Unknown' }]}
      >
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-neutral-900">Entity "{id}" could not be located in the indexed taxonomy.</p>
          <div className="mt-4">
            <Link to="/characters">
              <Button variant="outline" size="sm" className="font-mono text-xs gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Character Roster
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
        { label: 'Oases', href: '/home' },
        { label: 'Characters', href: '/characters' },
        { label: character.name },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <ClassBadge classType={character.classType} />
          {character.anomalyStatus && <StatusPill status={character.anomalyStatus} />}
        </div>
      }
    >
      <div className="space-y-8">
        {/* Entity Metadata Cards */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" />
                Monitored Telemetry Metric
              </span>
              <CardTitle className="text-xl font-mono text-neutral-900 pt-1">
                {character.currentMetricValue}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-xs font-mono text-neutral-400">
                Key: <code className="text-neutral-700 bg-neutral-100 px-1 py-0.5 rounded">{character.primaryMetric}</code>
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <span className="text-xs font-mono text-neutral-500">Target Contract / EOA</span>
              <div className="pt-1">
                <AddressPill address={character.targetAddress} chars={6} />
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-xs font-mono text-neutral-400">
                Network: Hedera EVM / Mainnet State
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <span className="text-xs font-mono text-neutral-500 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Subgraph Standard Source
              </span>
              <CardTitle className="text-sm font-mono text-neutral-800 pt-1 truncate" title={character.subgraphEndpoint}>
                Messari Standardized Schema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-xs font-mono text-emerald-600 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" weight="bold" />
                Deterministic Time-Travel Enabled
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Live Telemetry Signal Visualizer */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <Lightning className="w-4 h-4 text-neutral-800" weight="bold" />
              <h3 className="text-sm font-semibold font-display text-neutral-900">
                Live Subgraph Query Pipeline & State Proof
              </h3>
            </div>
            <span className="text-xs font-mono text-neutral-500">
              Debounce Window: 2 Blocks
            </span>
          </div>

          <div className="rounded-lg bg-neutral-950 p-4 font-mono text-xs text-neutral-200 overflow-x-auto">
            <div className="flex items-center justify-between text-neutral-500 mb-2 border-b border-neutral-800 pb-1">
              <span>GraphQL Time-Travel Template</span>
              <span>block: &#123; number: 20000142 &#125;</span>
            </div>
            <pre className="text-emerald-400">
{`query GetEntityTelemetry($account: ID!, $block: Int!) {
  account(id: $account, block: { number: $block }) {
    id
    positions {
      ${character.primaryMetric}
      timestamp
    }
  }
}`}
            </pre>
          </div>
        </div>

        {/* Linked Tension Casts */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold font-display text-neutral-900">
            Active Tension Casts Targeting This Entity ({linkedCasts.length})
          </h3>

          {linkedCasts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-8 text-center text-xs font-mono text-neutral-500">
              No active tension cast cluster currently binds this entity.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {linkedCasts.map((cast) => (
                <Card key={cast.id} className="p-5 flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm text-neutral-900 font-display">
                      {cast.title}
                    </h4>
                    <span className="text-xs font-mono text-neutral-500">
                      Horizon: #{cast.startBlock} → #{cast.deadlineBlock}
                    </span>
                  </div>
                  <Link
                    to="/tension-cast/$id"
                    params={{ id: cast.id }}
                  >
                    <Button variant="outline" size="sm" className="font-mono text-xs">
                      View Cast
                    </Button>
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </TerminalShell>
  )
}
