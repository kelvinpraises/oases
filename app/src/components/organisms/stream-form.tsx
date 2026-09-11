import { useState, useMemo } from 'react'
import {
  Play,
  Stop,
  Coins,
  Clock,
  Sparkle,
  CheckCircle,
  WarningCircle,
  Lightning,
  ShieldCheck,
} from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import { useWalletContext } from '@/providers/wallet-provider'
import { useProjectedShares } from '@/hooks/use-projected-shares'
import {
  ConvictionSide,
  perSecToRate,
  usdcToRaw,
} from '@oases/options'
import type { Hex } from 'viem'
import type { ChildVault } from '@/types/tension-cast'

interface StreamFormProps {
  vault: ChildVault
  marketId?: string
  onSuccess?: () => void
}

const MAX_RATE = 1.0 // 1.00 USDC / sec max on slider
const RATE_PRESETS = [0.01, 0.05, 0.1, 0.5]
const DEPOSIT_PRESETS = [10, 25, 50, 100]

export function StreamForm({ vault, marketId, onSuccess }: StreamFormProps) {
  const {
    isConnected,
    address,
    userTokenIds,
    connect,
    writer,
    refreshUserData,
  } = useWalletContext()

  const [side, setSide] = useState<ConvictionSide>(ConvictionSide.YES)
  // Travel fraction 0..100 for quadratic slider
  const [rateSliderTravel, setRateSliderTravel] = useState<number>(31.6) // default ~0.10/sec
  const [deposit, setDeposit] = useState<number>(25) // default $25 USDC
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [txMessage, setTxMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Quadratic rate mapping: rate = MAX_RATE * (travelFraction ** 2)
  const ratePerSec = useMemo(() => {
    const frac = rateSliderTravel / 100
    const raw = MAX_RATE * Math.pow(frac, 2)
    return Math.max(0.001, parseFloat(raw.toFixed(4)))
  }, [rateSliderTravel])

  // Invert rate to travel fraction for preset clicks
  const setRateFromPreset = (targetRate: number) => {
    const frac = Math.sqrt(targetRate / MAX_RATE)
    setRateSliderTravel(Math.min(100, Math.max(0, frac * 100)))
  }

  // Runway duration: durationSeconds = deposit / rate
  const runwaySeconds = useMemo(() => {
    if (ratePerSec <= 0) return 0
    return Math.floor(deposit / ratePerSec)
  }, [deposit, ratePerSec])

  const formatRunway = (seconds: number) => {
    if (seconds <= 0) return '0s'
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
    return parts.join(' ')
  }

  // Estimated blocks on Hedera / Anvil (~2 sec / block)
  const estimatedBlocks = useMemo(() => {
    return Math.floor(runwaySeconds / 2)
  }, [runwaySeconds])

  // Real-time 60 FPS live share accumulation preview
  const projection = useProjectedShares({
    preview: {
      ratePerSec,
      depositUSDC: deposit,
      initialPoolUSDC: vault.seedPotUSDC / 2,
    },
    enabled: true,
  })

  // NFT Gate check
  const hasNft = userTokenIds.length > 0
  const activeTokenId = hasNft ? userTokenIds[0] : null

  const handleStartStream = async () => {
    if (!isConnected) {
      await connect()
      return
    }

    if (!writer || !address) {
      setErrorMessage('Contract writer not initialized. Check wallet connection.')
      return
    }

    setIsSubmitting(true)
    setTxMessage(null)
    setErrorMessage(null)

    try {
      const resolvedMarketId = (marketId ||
        vault.marketId ||
        '0x0000000000000000000000000000000000000000000000000000000000000001') as Hex
      const resolvedVaultId = (vault.vaultId ||
        '0x0000000000000000000000000000000000000000000000000000000000000011') as Hex

      let tokenIdToUse = activeTokenId

      // Inline NFT Mint Gate: seamlessly chain mint if user does not have an NFT
      if (!tokenIdToUse) {
        setTxMessage('1/2 Minting Position Pass NFT...')
        const mintResult = await writer.mintFunderNft({
          marketId: resolvedMarketId,
          to: address,
        })
        tokenIdToUse = mintResult.tokenId
        setTxMessage(`Minted NFT #${tokenIdToUse.toString()}. Opening conviction stream...`)
      }

      setTxMessage('2/2 Approving USDC & Opening Stream on-chain...')
      const rawRate = perSecToRate(ratePerSec)
      const rawDeposit = usdcToRaw(deposit)

      await writer.fundStream({
        tokenId: tokenIdToUse,
        vaultId: resolvedVaultId,
        side,
        rate: rawRate,
        deposit: rawDeposit,
      })

      setTxMessage('Conviction stream opened successfully!')
      refreshUserData()
      onSuccess?.()
    } catch (err: any) {
      console.error('Stream submission error:', err)
      setErrorMessage(err?.shortMessage || err?.message || 'Transaction failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStopStream = async () => {
    if (!writer || !activeTokenId) return
    setIsSubmitting(true)
    setTxMessage(null)
    setErrorMessage(null)

    try {
      setTxMessage('Stopping conviction stream...')
      const resolvedVaultId = (vault.vaultId ||
        '0x0000000000000000000000000000000000000000000000000000000000000011') as Hex

      await writer.stopFunding({
        tokenId: activeTokenId,
        vaultId: resolvedVaultId,
        side,
      })

      setTxMessage('Stream halted. Accrued shares locked.')
      refreshUserData()
      onSuccess?.()
    } catch (err: any) {
      setErrorMessage(err?.shortMessage || err?.message || 'Failed to stop stream')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-6">
      {/* Header & Side Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div>
          <h3 className="font-display font-semibold text-base text-neutral-900 tracking-tight">
            Conviction Stream Configuration
          </h3>
          <p className="text-xs text-neutral-500 font-sans">
            Continuous zero-gas Drips position accumulator targeting {vault.characterName}
          </p>
        </div>

        {/* Side Selection Tabs */}
        <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 text-xs font-mono">
          <button
            type="button"
            onClick={() => setSide(ConvictionSide.YES)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all ${
              side === ConvictionSide.YES
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            YES BREACH
          </button>
          <button
            type="button"
            onClick={() => setSide(ConvictionSide.NO)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-all ${
              side === ConvictionSide.NO
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            NO DEFENSE
          </button>
        </div>
      </div>

      {/* Control 1: Quadratic Stream Rate Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="rate-slider" className="font-semibold text-neutral-800 flex items-center gap-1.5">
            <Lightning className="w-3.5 h-3.5 text-amber-600" weight="fill" />
            Stream Rate (USDC/sec)
          </label>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-base font-bold text-neutral-900 tabular-nums">
              ${ratePerSec.toFixed(3)}
            </span>
            <span className="text-[10px] text-neutral-400">/sec</span>
            <span className="text-[10px] text-neutral-500 ml-2">
              (${(ratePerSec * 3600).toFixed(2)}/hr)
            </span>
          </div>
        </div>

        {/* Quadratic slider: 0..100 travel maps to 0..MAX_RATE quadratically */}
        <input
          id="rate-slider"
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={rateSliderTravel}
          onChange={(e) => setRateSliderTravel(parseFloat(e.target.value))}
          className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
        />

        {/* Rate Presets */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[10px] font-mono text-neutral-400 mr-1">Presets:</span>
          {RATE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setRateFromPreset(preset)}
              className={`rounded px-2 py-0.5 font-mono text-[10px] border transition-colors ${
                Math.abs(ratePerSec - preset) < 0.005
                  ? 'bg-neutral-900 text-white border-neutral-900 font-semibold'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              ${preset.toFixed(2)}/s
            </button>
          ))}
        </div>
      </div>

      {/* Control 2: Total Deposit Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="deposit-slider" className="font-semibold text-neutral-800 flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-emerald-600" weight="fill" />
            Total Conviction Deposit
          </label>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-base font-bold text-neutral-900 tabular-nums">
              ${deposit.toFixed(2)}
            </span>
            <span className="text-[10px] text-neutral-400">USDC</span>
          </div>
        </div>

        <input
          id="deposit-slider"
          type="range"
          min="5"
          max="200"
          step="5"
          value={deposit}
          onChange={(e) => setDeposit(parseFloat(e.target.value))}
          className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
        />

        {/* Deposit Presets */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[10px] font-mono text-neutral-400 mr-1">Budget:</span>
          {DEPOSIT_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setDeposit(preset)}
              className={`rounded px-2 py-0.5 font-mono text-[10px] border transition-colors ${
                deposit === preset
                  ? 'bg-neutral-900 text-white border-neutral-900 font-semibold'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              ${preset}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Runway & Bonding Curve Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs font-mono">
        <div>
          <div className="text-[10px] uppercase text-neutral-400 flex items-center gap-1">
            <Clock className="w-3 h-3 text-neutral-500" />
            Runway Duration
          </div>
          <div className="font-semibold text-neutral-900 text-sm mt-0.5">
            {formatRunway(runwaySeconds)}
          </div>
          <div className="text-[10px] text-neutral-500">~{estimatedBlocks} blocks</div>
        </div>

        <div>
          <div className="text-[10px] uppercase text-neutral-400 flex items-center gap-1">
            <Sparkle className="w-3 h-3 text-neutral-500" />
            Base Price (P₀)
          </div>
          <div className="font-semibold text-neutral-900 text-sm mt-0.5">$0.100</div>
          <div className="text-[10px] text-neutral-500">Linear bonding seed</div>
        </div>

        <div className="col-span-2 sm:col-span-1">
          <div className="text-[10px] uppercase text-neutral-400 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-neutral-500" />
            Position Pass NFT
          </div>
          <div className="font-semibold text-neutral-900 text-sm mt-0.5">
            {hasNft ? (
              <span className="text-emerald-700">Token #{activeTokenId?.toString()}</span>
            ) : (
              <span className="text-amber-700">Needs Mint (1-Click)</span>
            )}
          </div>
          <div className="text-[10px] text-neutral-500">
            {hasNft ? 'Active Pass' : 'Auto-minted on start'}
          </div>
        </div>
      </div>

      {/* 60 FPS Zero-Gas Accumulation Ticker Preview */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[10px] font-semibold tracking-wider uppercase text-emerald-900">
              60 FPS Zero-Gas Projection Engine
            </span>
          </div>
          <span className="font-mono text-[10px] text-emerald-700">
            {projection.elapsedSeconds}s preview
          </span>
        </div>

        <div className="flex items-baseline justify-between pt-1">
          <div>
            <div className="text-[10px] font-mono text-neutral-500">Projected Share Accumulation</div>
            <div className="font-mono text-lg font-bold text-neutral-900 tabular-nums">
              {projection.formattedShares} <span className="text-xs font-normal text-neutral-500">SHARES</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono text-neutral-500">Est. Terminal Value</div>
            <div className="font-mono text-sm font-semibold text-emerald-800 tabular-nums">
              ~${((deposit / 0.1) * 0.1).toFixed(2)} USDC
            </div>
          </div>
        </div>
      </div>

      {/* Status & Error feedback */}
      {txMessage && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs font-mono text-neutral-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" weight="fill" />
          <span>{txMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs font-mono text-rose-700 flex items-center gap-2">
          <WarningCircle className="w-4 h-4 text-rose-600 shrink-0" weight="fill" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Action Buttons with NFT Mint Gate */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <Button
          type="button"
          onClick={handleStartStream}
          disabled={isSubmitting}
          className="w-full sm:flex-1 h-10 bg-neutral-900 hover:bg-neutral-800 text-white font-mono text-xs gap-2 font-semibold shadow-sm"
        >
          <Play className="w-4 h-4 text-emerald-400" weight="fill" />
          {isSubmitting
            ? 'Processing Transaction...'
            : !isConnected
            ? 'Connect Browser Wallet'
            : !hasNft
            ? 'Mint Position Pass & Open Stream'
            : `Open Conviction Stream ($${ratePerSec.toFixed(3)}/s)`}
        </Button>

        {hasNft && (
          <Button
            type="button"
            variant="outline"
            onClick={handleStopStream}
            disabled={isSubmitting}
            className="w-full sm:w-auto h-10 border-neutral-300 font-mono text-xs gap-1.5 text-neutral-700 hover:bg-neutral-50"
          >
            <Stop className="w-4 h-4 text-rose-600" weight="bold" />
            Stop Stream
          </Button>
        )}
      </div>
    </div>
  )
}
