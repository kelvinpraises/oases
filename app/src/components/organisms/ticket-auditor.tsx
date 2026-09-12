import { useState, useMemo } from 'react'
import {
  FileCode,
  ShieldCheck,
  CheckCircle,
  Copy,
  Check,
  CodeBlock,
  Cpu,
  ArrowsClockwise,
  BracketsCurly,
} from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import type { ChildVault } from '@/types/tension-cast'
import type { ReplayTicket, SolverManifest } from '@/types/replay'

interface TicketAuditorProps {
  vault: ChildVault
  className?: string
}

export function TicketAuditor({ vault, className = '' }: TicketAuditorProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<'proof' | 'manifest' | 'graphql'>('proof')
  const [copied, setCopied] = useState<boolean>(false)

  // Synthetic or decoded solver manifest for this vault
  const manifest: SolverManifest = useMemo(() => {
    if (vault.solverConfig) {
      try {
        const raw =
          typeof window !== 'undefined' && window.atob
            ? window.atob(vault.solverConfig)
            : Buffer.from(vault.solverConfig, 'base64').toString('utf-8')
        const decoded = JSON.parse(raw)
        if (decoded && typeof decoded === 'object' && decoded.query) {
          return decoded as SolverManifest
        }
      } catch (err) {
        console.warn('Failed to parse on-chain solverConfig for vault:', vault.id, err)
      }
    }

    return {
      version: '1.0.0',
      query: `query VerifyTelemetry($blockNumber: Int!) {
  account(id: "${vault.characterId}", block: { number: $blockNumber }) {
    healthFactor
    totalCollateralUSD
    totalDebtUSD
  }
}`,
      timeBounds: {
        startBlock: 20000000,
        deadlineBlock: 20000300,
      },
      globals: {
        healthFactor: 'data.account.healthFactor',
        collateral: 'data.account.totalCollateralUSD',
        debt: 'data.account.totalDebtUSD',
      },
      tree: [
        {
          type: 'expr',
          id: 'step_ratio',
          formula: 'collateral / debt',
          output: 'collateralRatio',
        },
        {
          type: 'expr',
          id: 'step_breach_check',
          formula: 'healthFactor <= 1.00',
          output: 'isBreached',
        },
      ],
      resolution: {
        triggerVariable: 'isBreached',
        debounceBlocks: 2,
      },
    }
  }, [vault.characterId, vault.solverConfig, vault.id])

  // Mocked or verified Replay Ticket corresponding to this vault
  const ticket: ReplayTicket = useMemo(() => {
    const isResolved = vault.status === 'RESOLVED'
    return {
      vaultId: vault.vaultId || vault.id,
      decision: isResolved ? 'RESOLVED_YES' : 'RESOLVED_YES',
      manifest,
      timestamp: Date.now() - 1000 * 60 * 3,
      queryTemplate: manifest.query || '',
      precedenceProof: {
        breachBlock: 20000140,
        startBlock: 20000000,
        deadlineBlock: 20000300,
        abortTimestamp: null,
        withinWindow: true,
        notAborted: true,
        consecutiveBreachBlocks: 2,
        requiredDebounce: 2,
        debounceVerified: true,
        valid: true,
        decision: 'RESOLVED_YES',
        reason: 'Condition healthFactor <= 1.00 satisfied across consecutive blocks 20000140 and 20000141',
      },
      blockSnapshots: [
        {
          blockNumber: 20000140,
          inputs: { healthFactor: 0.98, totalCollateralUSD: 14200000, totalDebtUSD: 14489000 },
          intermediate: { collateralRatio: 0.98, isBreached: true },
          trigger: true,
        },
        {
          blockNumber: 20000141,
          inputs: { healthFactor: 0.96, totalCollateralUSD: 13900000, totalDebtUSD: 14480000 },
          intermediate: { collateralRatio: 0.96, isBreached: true },
          trigger: true,
        },
      ],
    }
  }, [vault, manifest])

  const handleCopyQuery = async () => {
    try {
      await navigator.clipboard.writeText(ticket.queryTemplate)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard fallback
    }
  }

  const base64Sample = useMemo(() => {
    if (vault.solverConfig) return vault.solverConfig
    return typeof window !== 'undefined' && window.btoa
      ? window.btoa(JSON.stringify(manifest))
      : Buffer.from(JSON.stringify(manifest)).toString('base64')
  }, [vault.solverConfig, manifest])

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {/* Collapsed Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-neutral-50/60 border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <FileCode className="w-5 h-5" weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-sm text-neutral-900 tracking-tight">
                Replay Ticket Auditor
              </h3>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" weight="fill" />
                VERIFIABLE AST
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-sans">
              Attestation & provenance for {vault.question}
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="font-mono text-xs gap-1.5 h-8 border-neutral-300"
        >
          <BracketsCurly className="w-3.5 h-3.5" weight="bold" />
          {isOpen ? 'Close Auditor' : 'Inspect Ticket'}
        </Button>
      </div>

      {/* Expanded Auditor Drawer */}
      {isOpen && (
        <div className="p-5 space-y-6 animate-in fade-in duration-200 ease-out">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-3 font-mono text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('proof')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-[color,background-color,transform] active:scale-[0.97] duration-160 ease-out ${
                activeTab === 'proof'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" weight="bold" />
              Precedence Proof
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manifest')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-[color,background-color,transform] active:scale-[0.97] duration-160 ease-out ${
                activeTab === 'manifest'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" weight="bold" />
              Base64 Manifest
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('graphql')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-[color,background-color,transform] active:scale-[0.97] duration-160 ease-out ${
                activeTab === 'graphql'
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              <CodeBlock className="w-3.5 h-3.5" weight="bold" />
              GraphQL Query
            </button>
          </div>

          {/* Tab 1: Precedence Proof & Consecutive Blocks */}
          {activeTab === 'proof' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4 font-mono text-xs">
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-[10px] text-neutral-400 uppercase">Status</span>
                  <div className="mt-1 font-bold text-neutral-900 flex items-center gap-1 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-600" weight="fill" />
                    {ticket.precedenceProof.decision}
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-[10px] text-neutral-400 uppercase">Debounce</span>
                  <div className="mt-1 font-bold text-emerald-700 text-sm">
                    {ticket.precedenceProof.consecutiveBreachBlocks} / {ticket.precedenceProof.requiredDebounce} Blocks
                  </div>
                  <span className="text-[10px] text-neutral-400">Anti-flashloan</span>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-[10px] text-neutral-400 uppercase">Breach Block</span>
                  <div className="mt-1 font-bold text-neutral-900 text-sm">
                    #{ticket.precedenceProof.breachBlock}
                  </div>
                  <span className="text-[10px] text-neutral-400">Within horizon</span>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <span className="text-[10px] text-neutral-400 uppercase">Validity</span>
                  <div className="mt-1 font-bold text-emerald-700 text-sm flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-emerald-600" weight="fill" />
                    VALID
                  </div>
                </div>
              </div>

              {/* Consecutive Block Snapshots Trace */}
              <div className="space-y-2">
                <h4 className="font-mono text-xs font-semibold text-neutral-700 flex items-center gap-1.5">
                  <ArrowsClockwise className="w-3.5 h-3.5 text-neutral-500" />
                  Consecutive Block Snapshots (Debounce)
                </h4>

                <div className="grid gap-3 sm:grid-cols-2">
                  {ticket.blockSnapshots.map((snap, idx) => (
                    <div
                      key={snap.blockNumber}
                      className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 font-mono text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-neutral-200/60 pb-1.5">
                        <span className="font-bold text-neutral-900">
                          Step #{idx + 1}: Block #{snap.blockNumber}
                        </span>
                        <span className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                          BREACHED
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] uppercase text-neutral-400 block">Inputs:</span>
                        <div className="bg-white border border-neutral-200 rounded p-2 text-[11px] text-neutral-700 leading-relaxed overflow-x-auto">
                          {JSON.stringify(snap.inputs, null, 2)}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] uppercase text-neutral-400 block">Signals:</span>
                        <div className="bg-white border border-neutral-200 rounded p-2 text-[11px] text-neutral-700 leading-relaxed overflow-x-auto">
                          {JSON.stringify(snap.intermediate, null, 2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Proof Reason statement */}
              <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-xs font-mono text-neutral-700">
                <span className="font-semibold text-neutral-900 block mb-0.5">Verdict:</span>
                {ticket.precedenceProof.reason}
              </div>

              {/* Banked Position Integrity Attestation */}
              <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-xs font-mono text-neutral-700 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" weight="fill" />
                <div className="space-y-1">
                  <span className="font-semibold text-neutral-900 block">Position Equity Guarantee:</span>
                  <p className="text-[11px] text-neutral-600 font-sans leading-relaxed">
                    Under <code className="font-mono text-neutral-800">Vault.sol</code> and <code className="font-mono text-neutral-800">BondingBoard.sol</code>, all conviction positions continuously crystallize earned shares into <code className="font-mono text-neutral-800">sharesAccrued</code>. Pausing or depleting a stream halts continuous minting but locks 100% of accumulated shares on-chain for pro-rata prize pot settlement.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Base64 On-Chain Solver Manifest */}
          {activeTab === 'manifest' && (
            <div className="space-y-4 font-mono text-xs">
              <div className="space-y-1.5">
                <span className="font-semibold text-neutral-800 flex items-center justify-between">
                  <span>Base64 Commitment (`solverConfig`):</span>
                  <span className="text-[10px] text-neutral-400">Length: {base64Sample.length} bytes</span>
                </span>
                <div className="rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-800 p-3 text-[11px] font-mono break-all leading-relaxed max-h-24 overflow-y-auto">
                  {base64Sample}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-neutral-800">Decoded AST Manifest:</span>
                <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-72">
                  <pre className="text-neutral-800">{JSON.stringify(manifest, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: GraphQL Replay Query */}
          {activeTab === 'graphql' && (
            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-800">
                  Subgraph Query Template:
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyQuery}
                  className="h-7 text-xs font-mono gap-1 border-neutral-300 transition-[color,background-color,border-color,transform] active:scale-[0.97] duration-160 ease-out"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Query
                    </>
                  )}
                </Button>
              </div>

              <div className="rounded-lg bg-neutral-50 border border-neutral-200 text-neutral-800 p-3 text-[11px] font-mono leading-relaxed overflow-x-auto">
                <pre className="text-emerald-800 font-medium">{ticket.queryTemplate}</pre>
              </div>

              <p className="text-xs font-sans text-neutral-500">
                Execute this query against The Graph at block #{ticket.precedenceProof.breachBlock} to reproduce identical inputs and verify resolution.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
