import { Link, useRouterState } from '@tanstack/react-router'
import { Radio, Wallet, CheckCircle } from '@phosphor-icons/react'
import { Button } from '@/components/atoms/button'
import { useWalletContext } from '@/providers/wallet-provider'
import { useProtocolContext } from '@/providers/protocol-provider'
import { formatAddress } from '@/utils/format-address'
import { formatBlockNumber, formatUSDC } from '@/utils/format-currency'

export function NavHeader() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { isConnected, address, usdcBalance, connect, disconnect } = useWalletContext()
  const { currentBlock, telemetryStatus } = useProtocolContext()

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Left: Branding and Primary Navigation */}
        <div className="flex items-center gap-8">
          <Link to="/home" className="flex items-center gap-2.5 no-underline">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-900 text-white font-bold text-sm tracking-wider font-mono">
              O
            </span>
            <div className="flex flex-col">
              <span className="font-semibold text-neutral-900 tracking-tight text-sm font-display">
                OASES
              </span>
              <span className="text-[10px] uppercase font-mono tracking-widest text-neutral-400 -mt-1">
                Conviction Telemetry
              </span>
            </div>
          </Link>

          <nav className="flex items-center space-x-1">
            <Link
              to="/home"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                currentPath === '/home' || currentPath === '/'
                  ? 'bg-neutral-100 text-neutral-900 font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
              }`}
            >
              Tension Casts
            </Link>
            <Link
              to="/characters"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                currentPath.startsWith('/characters') || currentPath.startsWith('/character')
                  ? 'bg-neutral-100 text-neutral-900 font-semibold'
                  : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
              }`}
            >
              Characters
            </Link>
          </nav>
        </div>

        {/* Right: Telemetry pill & Wallet Connect */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-mono text-neutral-600">
            <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" weight="bold" />
            <span>Block #{formatBlockNumber(currentBlock)}</span>
            <span className="text-neutral-300">|</span>
            <span className="text-emerald-700 font-medium">{telemetryStatus}</span>
          </div>

          {isConnected && address ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="font-mono text-xs font-semibold text-neutral-900">
                  {formatUSDC(usdcBalance)}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">Hedera EVM</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                className="font-mono text-xs gap-1.5 h-8 border-neutral-300"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" weight="fill" />
                {formatAddress(address, 4)}
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => connect()}
              className="font-mono text-xs gap-1.5 h-8 bg-neutral-900 hover:bg-neutral-800 text-white"
            >
              <Wallet className="w-3.5 h-3.5" weight="bold" />
              Connect Wallet
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
