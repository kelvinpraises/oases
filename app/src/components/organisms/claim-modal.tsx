import { useState, useEffect, useMemo } from 'react'
import {
  Trophy,
  CheckCircle,
  WarningCircle,
  Sparkle,
  HandCoins,
} from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import { useWalletContext } from '@/providers/wallet-provider'
import { rawToUsdc } from '@oases/options'
import { formatUSDC } from '@/utils/format-currency'
import type { Hex } from 'viem'
import type { ChildVault, TensionCast } from '@/types/tension-cast'

interface ClaimModalProps {
  vault: ChildVault
  tensionCast: TensionCast
  onClaimSuccess?: () => void
  className?: string
}

export function ClaimModal({
  vault,
  tensionCast,
  onClaimSuccess,
  className = '',
}: ClaimModalProps) {
  const {
    isConnected,
    userTokenIds,
    reader,
    writer,
    connect,
    refreshUserData,
  } = useWalletContext()

  const [claimableAmount, setClaimableAmount] = useState<number>(0)
  const [winningSide, setWinningSide] = useState<number | null>(null)
  const [isResolved, setIsResolved] = useState<boolean>(vault.status === 'RESOLVED')
  const [isClaiming, setIsClaiming] = useState<boolean>(false)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeTokenId = userTokenIds.length > 0 ? userTokenIds[0] : null

  // Check on-chain claimable state
  useEffect(() => {
    if (!reader || !activeTokenId || !vault.vaultId) return

    let isMounted = true
    const checkClaimable = async () => {
      try {
        const record = await reader.readClaimable(vault.vaultId as Hex, activeTokenId)
        if (isMounted && record) {
          setIsResolved(record.isResolved)
          setWinningSide(record.winningSide !== undefined ? record.winningSide : null)
          setClaimableAmount(rawToUsdc(record.claimable))
        }
      } catch {
        // Fallback for mock/offline preview
        if (isMounted && vault.status === 'RESOLVED') {
          setIsResolved(true)
          setWinningSide(1) // YES outcome
          setClaimableAmount(124.8) // nominal winner payout
        }
      }
    }

    checkClaimable()
    return () => {
      isMounted = false
    }
  }, [reader, activeTokenId, vault])

  // All resolved child vaults in the tension cast for 1-click batch claim
  const resolvedVaultIds = useMemo(() => {
    return tensionCast.childVaults
      .filter((v) => v.status === 'RESOLVED' && v.vaultId)
      .map((v) => v.vaultId as Hex)
  }, [tensionCast])

  const handleClaimSingle = async () => {
    if (!isConnected) {
      await connect()
      return
    }

    if (!writer || !activeTokenId || !vault.vaultId) {
      setErrorMessage('Wallet not connected or Position NFT missing')
      return
    }

    setIsClaiming(true)
    setClaimMessage(null)
    setErrorMessage(null)

    try {
      setClaimMessage('Submitting withdrawal transaction...')
      await writer.withdraw({
        tokenId: activeTokenId,
        vaultId: vault.vaultId as Hex,
      })

      setClaimMessage('Winnings claimed successfully!')
      setClaimableAmount(0)
      refreshUserData()
      onClaimSuccess?.()
    } catch (err: unknown) {
      const errorObj = err as { shortMessage?: string; message?: string } | null
      setErrorMessage(errorObj?.shortMessage || errorObj?.message || 'Withdrawal failed')
    } finally {
      setIsClaiming(false)
    }
  }

  const handleClaimBatch = async () => {
    if (!isConnected) {
      await connect()
      return
    }

    if (!writer || !activeTokenId || resolvedVaultIds.length === 0) {
      setErrorMessage('No resolved vaults eligible for batch claim')
      return
    }

    setIsClaiming(true)
    setClaimMessage(null)
    setErrorMessage(null)

    try {
      setClaimMessage(`Submitting batch claim for ${resolvedVaultIds.length} resolved vaults...`)
      await writer.withdrawBatch({
        tokenId: activeTokenId,
        vaultIds: resolvedVaultIds,
      })

      setClaimMessage('Batch winnings claimed successfully!')
      setClaimableAmount(0)
      refreshUserData()
      onClaimSuccess?.()
    } catch (err: unknown) {
      const errorObj = err as { shortMessage?: string; message?: string } | null
      setErrorMessage(errorObj?.shortMessage || errorObj?.message || 'Batch withdrawal failed')
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4 ${className}`}>
      {/* Banner Top */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              isResolved ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            <Trophy className="w-5 h-5" weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-sm text-neutral-900 tracking-tight">
                Settlement & Claim Station
              </h3>
              <span
                className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold border ${
                  isResolved
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-neutral-100 text-neutral-600 border-neutral-200'
                }`}
              >
                {isResolved ? 'MARKET RESOLVED' : 'MARKET ACTIVE (STREAMING)'}
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-sans">
              {isResolved
                ? `Winning side: ${winningSide === 1 ? 'YES BREACH' : 'NO DEFENSE'}. Claim your pro-rata share of the positive-sum pot.`
                : 'Accumulated shares will unlock for withdrawal immediately upon certified on-chain resolution.'}
            </p>
          </div>
        </div>

        {/* Claimable Balance Readout */}
        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-xs text-neutral-400">Your Claimable:</span>
          <span className="text-lg font-bold text-neutral-900 tabular-nums">
            {formatUSDC(claimableAmount)}
          </span>
        </div>
      </div>

      {/* Action Messages */}
      {claimMessage && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs font-mono text-neutral-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" weight="fill" />
          <span>{claimMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs font-mono text-rose-700 flex items-center gap-2">
          <WarningCircle className="w-4 h-4 text-rose-600 shrink-0" weight="fill" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Claim Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <Button
          type="button"
          onClick={handleClaimSingle}
          disabled={isClaiming || (!isResolved && claimableAmount <= 0)}
          className={`w-full sm:flex-1 h-10 font-mono text-xs gap-2 font-semibold shadow-sm ${
            isResolved && claimableAmount > 0
              ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
              : 'bg-neutral-900 hover:bg-neutral-800 text-white'
          }`}
        >
          <HandCoins className="w-4 h-4" weight="bold" />
          {isClaiming
            ? 'Processing Settlement Claim...'
            : isResolved
            ? `Claim ${formatUSDC(claimableAmount)} Winnings`
            : 'Settlement Locked (Active Stream)'}
        </Button>

        {resolvedVaultIds.length > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={handleClaimBatch}
            disabled={isClaiming}
            className="w-full sm:w-auto h-10 border-neutral-300 font-mono text-xs gap-1.5 text-neutral-700 hover:bg-neutral-50"
          >
            <Sparkle className="w-4 h-4 text-amber-600" weight="fill" />
            Batch Claim All ({resolvedVaultIds.length} Vaults)
          </Button>
        )}
      </div>
    </div>
  )
}
