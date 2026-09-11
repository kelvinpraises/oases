import { useState, useEffect, useRef, useCallback } from 'react'
import type { JournalEntry, JournalLevel, StreamMessage, InitBackfillPayload } from '@/types/journal'

const SEED_JOURNAL_ENTRIES: JournalEntry[] = [
  {
    id: 'entry-001',
    timestamp: Date.now() - 1000 * 180,
    level: 'INFO',
    type: 'SYSTEM_LIFECYCLE',
    source: 'daemon_harness',
    thought:
      'Apex daemon initialized. Watching 3 physical protocol entities across block range #20000000 - #20000300.',
    confidenceScore: 1.0,
    blockNumber: 20000130,
  },
  {
    id: 'entry-002',
    timestamp: Date.now() - 1000 * 140,
    level: 'INFO',
    type: 'MARKET_METRIC_ANALYSIS',
    source: 'detective_agent',
    thought:
      'Polled Actor 0x7a health factor via Aave v3 subgraph. Current metric: 1.14 (delta: -0.04 over last 20 blocks).',
    confidenceScore: 0.96,
    metricValue: '1.14',
    blockNumber: 20000134,
  },
  {
    id: 'entry-003',
    timestamp: Date.now() - 1000 * 95,
    level: 'ANOMALY',
    type: 'DEVIATION_ANALYSIS',
    source: 'detective_agent',
    thought:
      'Actor 0x7a debt invariant coupling anomaly: Collateral price downward pressure accelerated. Health factor fell to 1.12. Breach threshold 1.00 is within 12% tolerance.',
    confidenceScore: 0.91,
    metricValue: '1.12',
    blockNumber: 20000138,
  },
  {
    id: 'entry-004',
    timestamp: Date.now() - 1000 * 60,
    level: 'ALERT',
    type: 'CONTAGION_ANALYSIS',
    source: 'reflex_loop',
    thought:
      'Contagion synthesis: Place (Aave v3 Core Reserve) USDC utilization climbed to 84.5%. Bond (0x7a CRV Debt) coupling total borrow stands at $14.28M. Co-movement correlation >= 0.88.',
    confidenceScore: 0.89,
    metricValue: '84.5% Util',
    blockNumber: 20000140,
  },
  {
    id: 'entry-005',
    timestamp: Date.now() - 1000 * 20,
    level: 'ANOMALY',
    type: 'THRESHOLD_ANALYSIS',
    source: 'detective_agent',
    thought:
      'Reflex loop cadence adjusted to aggressive 2000ms. Monitoring consecutive breach debounce counter (0/2). Conviction flow accelerating on YES outcome.',
    confidenceScore: 0.94,
    metricValue: 'Debounce 0/2',
    blockNumber: 20000142,
  },
]

export interface UseJournalStreamOptions {
  wsUrl?: string
  enableWs?: boolean
}

export function useJournalStream(options: UseJournalStreamOptions = {}) {
  const { wsUrl = 'ws://127.0.0.1:4001', enableWs = true } = options
  const [entries, setEntries] = useState<JournalEntry[]>(SEED_JOURNAL_ENTRIES)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [filterLevel, setFilterLevel] = useState<JournalLevel | 'ALL'>('ALL')
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const addEntry = useCallback((entry: JournalEntry) => {
    setEntries((prev) => {
      // Prevent duplicate entry ids
      if (prev.some((e) => e.id === entry.id)) return prev
      return [...prev, entry]
    })
  }, [])

  useEffect(() => {
    if (!enableWs || typeof window === 'undefined') return

    let isDisposed = false

    const connectWs = () => {
      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (isDisposed) {
            ws.close()
            return
          }
          setIsConnected(true)
        }

        ws.onmessage = (event) => {
          try {
            const message: StreamMessage = JSON.parse(event.data)
            if (message.type === 'INIT_BACKFILL') {
              const payload = message.data as InitBackfillPayload
              if (payload?.thoughts && Array.isArray(payload.thoughts)) {
                setEntries((prev) => {
                  const existingIds = new Set(prev.map((e) => e.id))
                  const newThoughts = payload.thoughts.filter((t: JournalEntry) => !existingIds.has(t.id))
                  return [...prev, ...newThoughts]
                })
              }
            } else if (message.type === 'JOURNAL_ENTRY') {
              const entry = message.data as JournalEntry
              if (entry && entry.id) {
                addEntry(entry)
              }
            }
          } catch {
            // Ignore malformed WS frames
          }
        }

        ws.onclose = () => {
          setIsConnected(false)
          if (!isDisposed) {
            reconnectTimeoutRef.current = setTimeout(connectWs, 5000)
          }
        }

        ws.onerror = () => {
          setIsConnected(false)
          ws.close()
        }
      } catch {
        setIsConnected(false)
        if (!isDisposed) {
          reconnectTimeoutRef.current = setTimeout(connectWs, 5000)
        }
      }
    }

    connectWs()

    return () => {
      isDisposed = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [wsUrl, enableWs, addEntry])

  const filteredEntries = entries.filter((entry) => {
    if (filterLevel === 'ALL') return true
    return entry.level === filterLevel
  })

  return {
    entries: filteredEntries,
    allEntries: entries,
    isConnected,
    filterLevel,
    setFilterLevel,
  }
}
