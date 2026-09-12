import { useState, useEffect } from 'react'
import { Drop, CheckCircle, WarningCircle, CircleNotch } from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import { useWalletContext } from '@/providers/wallet-provider'

interface FaucetStationProps {
  className?: string
  compact?: boolean
}

export function FaucetStation({ className, compact = false }: FaucetStationProps) {
  const { isConnected, claimMockUsdc, connect, isHedera } = useWalletContext()
  const [isClaiming, setIsClaiming] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Cooldown decrement ticker
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  // Clear feedback after 6 seconds
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => {
      setFeedback(null)
    }, 6000)
    return () => clearInterval(timer)
  }, [feedback])

  const handleClaim = async () => {
    if (!isConnected) {
      await connect()
      return
    }

    if (cooldown > 0 || isClaiming) return

    setIsClaiming(true)
    setFeedback(null)

    try {
      // Dispenses $100 Mock USDC (100_000_000 units with 6 decimals)
      await claimMockUsdc(100_000_000n)
      setFeedback({
        type: 'success',
        message: isHedera
          ? 'Minted $100 USDC on Hedera Testnet'
          : 'Minted $100 USDC on Localhost',
      })
      setCooldown(60) // 60s cooldown
    } catch (err: any) {
      console.error('Faucet claim error:', err)
      setFeedback({
        type: 'error',
        message: err?.shortMessage || err?.message || 'Failed to claim demo funds',
      })
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <div className={`relative flex items-center ${className || ''}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClaim}
        disabled={isClaiming || cooldown > 0}
        className={`font-mono text-xs font-semibold h-8 border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 shadow-2xs transition-[color,background-color,border-color,transform] active:scale-[0.97] duration-160 ease-out ${
          cooldown > 0 ? 'opacity-60 cursor-not-allowed' : ''
        }`}
        title="Claim 1 HBAR for gas + $100 Mock USDC for conviction streaming"
      >
        {isClaiming && (
          <CircleNotch className="w-3.5 h-3.5 text-emerald-600 animate-spin shrink-0" />
        )}
        {!isClaiming && cooldown > 0 && (
          <Drop className="w-3.5 h-3.5 text-neutral-400 shrink-0" weight="bold" />
        )}

        <span className={`${isClaiming || cooldown > 0 ? 'ml-1.5' : ''} whitespace-nowrap`}>
          {isClaiming
            ? 'Minting...'
            : cooldown > 0 ? (
              <span>
                Cooldown (<span className="tabular-nums font-semibold">{cooldown}</span>s)
              </span>
            ) : compact
            ? '🚰 Faucet'
            : '🚰 Faucet ($100 USDC)'}
        </span>
      </Button>

      {/* Floating Status Notification */}
      {feedback && (
        <div
          className={`absolute top-full mt-2 right-0 z-50 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-mono shadow-md whitespace-nowrap toast-enter ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" weight="fill" />
          ) : (
            <WarningCircle className="w-4 h-4 text-rose-600 shrink-0" weight="fill" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  )
}
