import { useState, useEffect } from 'react'
import {
  X,
  Coins,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  ArrowRight,
  Info,
} from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import { useWalletContext } from '@/providers/wallet-provider'
import { usePitches } from '@/hooks/use-pitches'
import { ANOMALY_TEMPLATES, type AnomalyPitch } from '@/types/pitch'
import { formatUSDC } from '@/utils/format-currency'

interface PitchDrawerProps {
  isOpen: boolean
  onClose: () => void
  defaultCharacterId?: string
  onSuccess?: (pitch: AnomalyPitch) => void
}

const CHARACTERS = [
  { id: 'whale-0x7a', name: 'Whale 0x7a' },
  { id: 'aave-core', name: 'Aave v3 Core Pool' },
]

export function PitchDrawer({
  isOpen,
  onClose,
  defaultCharacterId,
  onSuccess,
}: PitchDrawerProps) {
  const { isConnected, address, usdcBalance, connect } = useWalletContext()
  const { submitPitch } = usePitches()

  const [characterId, setCharacterId] = useState(defaultCharacterId || 'whale-0x7a')
  const [thesis, setThesis] = useState('')
  const [metricKey, setMetricKey] = useState('healthFactor')
  const [evaluationTimebox, setEvaluationTimebox] = useState(50)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [txSuccess, setTxSuccess] = useState<AnomalyPitch | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Sync default character
  useEffect(() => {
    if (defaultCharacterId) {
      setCharacterId(defaultCharacterId)
    }
  }, [defaultCharacterId])

  // Set default template if empty
  useEffect(() => {
    if (!thesis && ANOMALY_TEMPLATES.length > 0) {
      const defaultTpl = ANOMALY_TEMPLATES[0]
      setThesis(defaultTpl.thesis)
      setMetricKey(defaultTpl.metricKey)
      setEvaluationTimebox(defaultTpl.evaluationTimebox)
    }
  }, [thesis])

  // Handle template selection
  const handleSelectTemplate = (tplId: string) => {
    const tpl = ANOMALY_TEMPLATES.find((t) => t.id === tplId)
    if (tpl) {
      setCharacterId(tpl.characterId)
      setThesis(tpl.thesis)
      setMetricKey(tpl.metricKey)
      setEvaluationTimebox(tpl.evaluationTimebox)
      setErrorMessage(null)
    }
  }

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!isOpen) return null

  const selectedCharName =
    CHARACTERS.find((c) => c.id === characterId)?.name || 'Whale 0x7a'
  const hasInsufficientBalance = isConnected && usdcBalance < 5.0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isConnected) {
      await connect()
      return
    }

    if (!address) return

    if (hasInsufficientBalance) {
      setErrorMessage('Insufficient USDC balance. Claim $100 Demo USDC from the Faucet Station above.')
      return
    }

    if (!thesis.trim()) {
      setErrorMessage('Please specify an anomaly thesis statement.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const pitch = await submitPitch({
        characterId,
        characterName: selectedCharName,
        submitter: address,
        thesis: thesis.trim(),
        metricKey: metricKey.trim(),
        evaluationTimebox: Number(evaluationTimebox) || 50,
      })

      setTxSuccess(pitch)
      onSuccess?.(pitch)
    } catch (err: any) {
      console.error('Pitch submission error:', err)
      setErrorMessage(err?.shortMessage || err?.message || 'Failed to submit pitch')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-md bg-white border-l border-neutral-200 shadow-2xl flex flex-col justify-between">
          {/* Drawer Header */}
          <div className="p-6 border-b border-neutral-100 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-800 font-mono text-xs font-bold">
                  ⚡
                </span>
                <h2 className="font-display font-semibold text-lg text-neutral-900 tracking-tight">
                  Pitch Anomaly Thesis
                </h2>
              </div>
              <p className="mt-1 text-xs text-neutral-500 font-sans">
                Submit an autonomous telemetry anomaly. Injects $4.00 (80%) directly into the Tension Cast prize pot.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body Form */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {txSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 space-y-4 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle className="w-7 h-7" weight="fill" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-neutral-900">
                    Anomaly Pitch Injected!
                  </h3>
                  <p className="text-xs text-neutral-600 mt-1">
                    Your anomaly proposal was certified on-chain and registered with the sovereign sentinel fleet.
                  </p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-white p-3 font-mono text-xs text-left space-y-1.5">
                  <div className="flex justify-between text-neutral-500">
                    <span>Injected Pot Yield:</span>
                    <span className="font-bold text-emerald-700">+$4.00 USDC</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>Sentinel Gas Reserve:</span>
                    <span className="text-neutral-700">$1.00 USDC</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>Target Character:</span>
                    <span className="text-neutral-900 font-semibold">{txSuccess.characterName}</span>
                  </div>
                  <div className="flex justify-between text-neutral-500">
                    <span>Evaluation Window:</span>
                    <span className="text-neutral-900 font-semibold">{txSuccess.evaluationTimebox} blocks</span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => {
                    setTxSuccess(null)
                    onClose()
                  }}
                  className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs h-9"
                >
                  View in Tension Cast
                </Button>
              </div>
            ) : (
              <form id="pitch-form" onSubmit={handleSubmit} className="space-y-5">
                {/* Prefilled Templates */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-neutral-700 flex items-center justify-between">
                    <span>Prefilled Anomaly Templates</span>
                    <span className="text-[10px] text-neutral-400 font-mono">1-Click Load</span>
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {ANOMALY_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleSelectTemplate(tpl.id)}
                        className="flex flex-col text-left rounded-lg border border-neutral-200 p-2.5 hover:border-neutral-400 hover:bg-neutral-50 transition-all group"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-neutral-900 group-hover:text-emerald-700">
                          <span>{tpl.title}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-emerald-700 transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <span className="text-[11px] text-neutral-500 mt-1 line-clamp-1">
                          {tpl.thesis}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Character */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700">
                    Target Protocol Character
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CHARACTERS.map((char) => (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => setCharacterId(char.id)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium text-left transition-colors ${
                          characterId === char.id
                            ? 'border-neutral-900 bg-neutral-900 text-white font-semibold'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {char.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thesis Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-neutral-700">
                    Anomaly Thesis
                  </label>
                  <textarea
                    rows={3}
                    value={thesis}
                    onChange={(e) => setThesis(e.target.value)}
                    placeholder="e.g. Whale 0x7a health factor degrades below 1.05..."
                    className="w-full rounded-lg border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 font-sans"
                    required
                  />
                </div>

                {/* Metric Key & Timebox */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-neutral-700 font-mono">
                      Metric Key
                    </label>
                    <input
                      type="text"
                      value={metricKey}
                      onChange={(e) => setMetricKey(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-mono text-neutral-900 focus:border-neutral-900 focus:outline-none"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-neutral-700 font-mono">
                      Timebox (Blocks)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={evaluationTimebox}
                      onChange={(e) => setEvaluationTimebox(Number(e.target.value))}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-mono text-neutral-900 focus:border-neutral-900 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Protocol Fee Breakdown Card (Master Directive) */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="font-semibold text-neutral-800 flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-emerald-600" weight="fill" />
                      Total Pitch Commitment
                    </span>
                    <span className="font-bold text-neutral-900 text-sm">$5.00 USDC</span>
                  </div>

                  <div className="space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        80% Tension Cast Yield Injection
                      </span>
                      <span className="font-semibold text-emerald-700">+$4.00 USDC</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600 flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-neutral-400" />
                        20% Sovereign Sentinel Gas Reserve
                      </span>
                      <span className="font-semibold text-neutral-700">$1.00 USDC</span>
                    </div>
                  </div>

                  {/* Non-Refundable Commitment Notice */}
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[10px] font-sans text-amber-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" weight="fill" />
                    <span>
                      <strong>Irrevocable Protocol Commitment:</strong> Pitch fees are injected directly into the prize pot yield upon submission and are non-refundable regardless of thesis verdict.
                    </span>
                  </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs font-mono text-rose-700 flex items-center gap-2">
                    <WarningCircle className="w-4 h-4 text-rose-600 shrink-0" weight="fill" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Drawer Footer CTA */}
          <div className="p-6 border-t border-neutral-100 bg-neutral-50/50 space-y-3">
            {!txSuccess && (
              <>
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-neutral-500">Your Wallet Balance:</span>
                  <span
                    className={`font-semibold ${
                      hasInsufficientBalance ? 'text-rose-600' : 'text-neutral-900'
                    }`}
                  >
                    {formatUSDC(usdcBalance)}
                  </span>
                </div>

                <Button
                  type="submit"
                  form="pitch-form"
                  disabled={isSubmitting}
                  className="w-full h-11 bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs font-semibold shadow-sm gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <CircleNotch className="w-4 h-4 text-emerald-400 animate-spin" />
                      Injecting Protocol Yield...
                    </>
                  ) : !isConnected ? (
                    'Connect Wallet to Submit Pitch'
                  ) : hasInsufficientBalance ? (
                    'Insufficient Funds ($5.00 Required)'
                  ) : (
                    'Submit Anomaly Pitch ($5.00 USDC)'
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
