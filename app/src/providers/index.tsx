import React from 'react'
import { ProtocolProvider } from './protocol-provider'
import { WalletProvider } from './wallet-provider'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ProtocolProvider>
      <WalletProvider>
        {children}
      </WalletProvider>
    </ProtocolProvider>
  )
}

export * from './protocol-provider'
export * from './wallet-provider'
