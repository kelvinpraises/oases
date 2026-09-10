import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { UsersThree, Funnel } from '@phosphor-icons/react'
import { TerminalShell } from '@/components/template/terminal-shell'
import { CharacterCard } from '@/components/organisms/character-card'
import { Button } from '@/components/atoms/button'
import { useCharacters } from '@/hooks/use-characters'
import type { PhysicalClass } from '@/types/character'

export const Route = createFileRoute('/characters')({
  component: CharactersPage,
})

const CLASS_FILTERS: Array<PhysicalClass | 'All'> = ['All', 'Actor', 'Place', 'Act', 'Bond']

function CharactersPage() {
  const [selectedClass, setSelectedClass] = useState<PhysicalClass | 'All'>('All')
  const { characters, totalCount } = useCharacters(selectedClass)

  return (
    <TerminalShell
      title="Tracked Entity Roster"
      subtitle="On-chain protocol entities categorized across the 4 Immutable Physics Classes (subclasses purged)."
      breadcrumbs={[{ label: 'Oases', href: '/home' }, { label: 'Characters' }]}
      actions={
        <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-mono text-neutral-700">
          <UsersThree className="w-4 h-4 text-neutral-600" weight="bold" />
          <span>{totalCount} Indexed Entities</span>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Filter Navigation Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-4">
          <div className="flex items-center gap-2">
            <Funnel className="w-4 h-4 text-neutral-400" />
            <span className="text-xs font-mono font-medium text-neutral-600 uppercase tracking-wider">
              Filter by Class:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {CLASS_FILTERS.map((filter) => (
              <Button
                key={filter}
                variant={selectedClass === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedClass(filter)}
                className={`font-mono text-xs h-7 px-2.5 ${
                  selectedClass === filter
                    ? 'bg-neutral-900 text-white'
                    : 'border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>

        {/* Character Cards Grid */}
        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 p-12 text-center bg-white">
            <p className="text-sm font-medium text-neutral-900">No entities found in class "{selectedClass}"</p>
            <p className="text-xs text-neutral-500 max-w-sm mt-1">
              Select another class or switch to "All" to view the full protocol taxonomy roster.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map((character) => (
              <CharacterCard key={character.id} character={character} />
            ))}
          </div>
        )}

        {/* Taxonomy Primer Footer */}
        <div className="mt-12 rounded-xl border border-neutral-200 bg-neutral-100/50 p-6 text-xs text-neutral-600 space-y-3">
          <h4 className="font-semibold text-neutral-900 font-display text-sm">
            The 4 Immutable Physics Classes
          </h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono">
            <div className="space-y-1">
              <span className="font-bold text-neutral-900">1. Actor:</span>
              <p className="text-[11px] text-neutral-500">Decides, holds private keys, directional capital bias (EOA, Bot, Treasury).</p>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-neutral-900">2. Place:</span>
              <p className="text-[11px] text-neutral-500">Passive container where actors meet (Lending Pool, AMM, Staking Vault).</p>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-neutral-900">3. Act:</span>
              <p className="text-[11px] text-neutral-500">Finite event unfolding across time (Liquidation spiral, Governance coup).</p>
            </div>
            <div className="space-y-1">
              <span className="font-bold text-neutral-900">4. Bond:</span>
              <p className="text-[11px] text-neutral-500">Directed relational coupling between two entities (Collateral-debt link).</p>
            </div>
          </div>
        </div>
      </div>
    </TerminalShell>
  )
}
