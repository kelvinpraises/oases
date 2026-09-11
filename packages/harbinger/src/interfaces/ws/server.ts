import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { JournalService } from "../../services/journal/journal-service";
import type { JournalEntry } from "../../models/JournalEntry";
import { formatBroadcastMessage } from "./broadcaster";

export interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

export interface WebSocketStreamOptions {
  heartbeatIntervalMs?: number;
  backfillLimit?: number;
}

export class WebSocketStreamServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<ExtendedWebSocket> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private unsubscribeJournal?: () => void;
  private heartbeatIntervalMs: number;
  private backfillLimit: number;

  constructor(
    private journalService: JournalService,
    private port = 4001,
    private host = "0.0.0.0",
    options?: WebSocketStreamOptions,
  ) {
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 30_000;
    this.backfillLimit = options?.backfillLimit ?? 50;
  }

  /**
   * Starts the outbound WebSocket server.
   */
  public async start(server?: Server): Promise<void> {
    if (this.wss) return;

    const wss = await new Promise<WebSocketServer>((resolve, reject) => {
      try {
        const instance: WebSocketServer = server
          ? new WebSocketServer({ server })
          : new WebSocketServer({ port: this.port, host: this.host }, () => {
              resolve(instance);
            });

        if (server) {
          resolve(instance);
        }

        instance.on("error", (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });

    this.wss = wss;

    wss.on("connection", async (ws: WebSocket) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.isAlive = true;
      this.clients.add(extWs);

      extWs.on("pong", () => {
        extWs.isAlive = true;
      });

      // Axiom 4.3: One-Way Outbound Invariant (Reject all inbound client messages)
      extWs.on("message", () => {
        extWs.close(1008, "Policy Violation: WebSocket stream is strictly read-only outbound");
      });

      extWs.on("close", () => {
        this.clients.delete(extWs);
      });

      // Transmit initial backfill burst of recent thoughts
      try {
        const recent = await this.journalService.getRecentThoughts(this.backfillLimit);
        if (extWs.readyState === WebSocket.OPEN) {
          extWs.send(
            formatBroadcastMessage("INIT_BACKFILL", {
              thoughts: recent,
              totalCount: recent.length,
            }),
          );
        }
      } catch {
        // Safe catch on early client disconnect
      }
    });

    // Wire live thoughts from JournalService to all connected clients
    this.unsubscribeJournal = this.journalService.subscribe((entry: JournalEntry) => {
      this.broadcast(formatBroadcastMessage("JOURNAL_ENTRY", entry));
    });

    // 30s Heartbeat Ping/Pong (Axiom 4.5)
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          this.clients.delete(client);
          client.terminate();
          continue;
        }
        client.isAlive = false;
        client.ping();
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Broadcasts a payload string or object to all open connected clients.
   */
  public broadcast(message: unknown): void {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  /**
   * Stops the server, terminates all clients, and clears timers.
   */
  public async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.unsubscribeJournal) {
      this.unsubscribeJournal();
      this.unsubscribeJournal = undefined;
    }
    for (const client of this.clients) {
      try {
        if (
          client.readyState === WebSocket.OPEN ||
          client.readyState === WebSocket.CONNECTING
        ) {
          client.close(1001, "Harbinger daemon shutting down");
        }
      } catch {
        // Client already closed or unreachable
      }
      client.terminate();
    }
    this.clients.clear();

    if (this.wss) {
      const serverInstance = this.wss;
      this.wss = null;
      await new Promise<void>((resolve) => {
        serverInstance.close(() => resolve());
      });
    }
  }

  public getConnectedClientCount(): number {
    return this.clients.size;
  }

  public getPort(): number {
    if (!this.wss) return this.port;
    const address = this.wss.address();
    if (typeof address === "object" && address !== null) {
      return (address as AddressInfo).port;
    }
    return this.port;
  }
}
