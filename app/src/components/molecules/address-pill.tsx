import * as React from 'react'
import { Copy, Check } from '@phosphor-icons/react'
import { formatAddress } from '@/utils/format-address'
import { cn } from '@/utils/cn'

interface AddressPillProps {
  address: string
  chars?: number
  className?: string
  showCopy?: boolean
}

export function AddressPill({
  address,
  chars = 4,
  className,
  showCopy = true,
}: AddressPillProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore clipboard error
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-mono text-neutral-700 select-all transition-colors hover:bg-neutral-100',
        className
      )}
      title={address}
    >
      <span>{formatAddress(address, chars)}</span>
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy address"
          className="inline-flex items-center text-neutral-400 hover:text-neutral-900 focus:outline-none"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-600" weight="bold" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      )}
    </span>
  )
}
