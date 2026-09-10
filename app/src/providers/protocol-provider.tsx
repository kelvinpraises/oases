import React, { createContext, useContext, useState } from 'react'

interface ProtocolContextType {
  networkName: string
  currentBlock: number
  telemetryStatus: 'SYNCED' | 'STREAMING' | 'DISCONNECTED'
}

const ProtocolContext = createContext<ProtocolContextType | null>(null)

export function ProtocolProvider({ children }: { children: React.ReactNode }) {
  const [protocol] = useState<ProtocolContextType>({
    networkName: 'Hedera EVM / Ethereum Subgraph',
    currentBlock: 20000142,
    telemetryStatus: 'SYNCED',
  })

  return (
    <ProtocolContext.Provider value={protocol}>
      {children}
    </ProtocolContext.Provider>
  )
}

export function useProtocolContext() {
  const context = useContext(ProtocolContext)
  if (!context) {
    throw new Error('useProtocolContext must be used within a ProtocolProvider')
  }
  return context
}
