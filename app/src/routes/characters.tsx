import { useState, useMemo } from 'react'
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

const CLASS_META: Record<PhysicalClass, { description: string; role: string }> = {
  Actor: {
    role: 'Keyholder',
    description: 'Holds keys and capital bias (EOA, Bot, Treasury).',
  },
  Place: {
    role: 'Reservoir',
    description: 'State and liquidity reservoir (Pool, AMM, Vault).',
  },
  Act: {
    role: 'Event',
    description: 'Finite event sequence (Liquidation, Vote).',
  },
  Bond: {
    role: 'Invariant',
    description: 'Relational coupling invariant (Debt ratio, Peg).',
  },
}

function CharactersPage() {
  const [selectedClass, setSelectedClass] = useState<PhysicalClass | 'All'>('All')
  const { characters, allCharacters, totalCount } = useCharacters(selectedClass)

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: allCharacters.length }
    allCharacters.forEach((c) => {
      map[c.classType] = (map[c.classType] || 0) + 1
    })
    return map
  }, [allCharacters])

  return (
    <TerminalShell
      title="Tracked Entities"
      breadcrumbs={[{ label: 'Oases', href: '/home' }, { label: 'Characters' }]}
      actions={
        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-mono text-neutral-800 shadow-2xs">
          <UsersThree className="w-4 h-4 text-neutral-600" weight="bold" />
          <span className="font-semibold tabular-nums">{totalCount} Entities</span>
        </div>
      }
    >
      <div className="space-y-6 stagger-container">
        {/* Tactile Taxonomy Segmented Control */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200/80 pb-4">
          <div className="flex items-center gap-2">
            <Funnel className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-xs font-mono font-medium text-neutral-600 uppercase tracking-wider">
              Class:
            </span>
          </div>

          <div className="inline-flex flex-wrap items-center gap-1.5 p-1 rounded-lg border border-neutral-200 bg-neutral-50/80">
            {CLASS_FILTERS.map((filter) => {
              const isSelected = selectedClass === filter
              const count = counts[filter] || 0

              return (
                <Button
                  key={filter}
                  variant={isSelected ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedClass(filter)}
                  className={`font-mono text-xs h-7 px-2.5 gap-1.5 rounded transition-[background-color,color,transform,box-shadow] duration-160 ease-out active:scale-[0.96] ${
                    isSelected
                      ? 'bg-neutral-900 text-white shadow-xs font-semibold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60'
                  }`}
                >
                  <span>{filter}</span>
                  <span
                    className={`text-[10px] tabular-nums ${
                      isSelected ? 'text-neutral-300' : 'text-neutral-400'
                    }`}
                  >
                    ({count})
                  </span>
                </Button>
              )
            })}
          </div>
        </div>

        {/* Character Cards Grid */}
        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 p-12 text-center bg-white shadow-xs">
            <p className="text-sm font-medium text-neutral-900">No entities found.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 stagger-container">
            {characters.map((character) => (
              <CharacterCard key={character.id} character={character} />
            ))}
          </div>
        )}

        {/* 4 Physics Classes Blueprint Reference Matrix */}
        <div className="mt-10 rounded-xl border border-neutral-200 bg-white p-6 shadow-xs text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h4 className="font-semibold text-neutral-900 font-display text-sm tracking-tight text-balance">
              The 4 Physics Classes
            </h4>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 font-mono">
            {(['Actor', 'Place', 'Act', 'Bond'] as PhysicalClass[]).map((cls, idx) => {
              const meta = CLASS_META[cls]
              return (
                <div
                  key={cls}
                  className="rounded-lg border border-neutral-200/80 bg-neutral-50/50 p-3.5 space-y-2 hover:border-neutral-300 hover:bg-white transition-[border-color,background-color] duration-160 ease-out"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900 flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full bg-neutral-900" />
                      {idx + 1}. {cls}
                    </span>
                    <span className="text-[9px] text-neutral-400 uppercase">{meta.role}</span>
                  </div>
                  <p className="text-[11px] text-neutral-600 font-sans leading-relaxed text-pretty">
                    {meta.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </TerminalShell>
  )
}
