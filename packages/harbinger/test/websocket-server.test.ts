import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { WebSocketStreamServer } from "../src/interfaces/ws/server";
import { getWsServerHealth } from "../src/interfaces/ws/health";
import { JournalService } from "../src/services/journal/journal-service";
import { getDatabase, closeDatabase } from "../src/infrastructure/database/connection";
import type { Kysely } from "kysely";
import type { HarbingerDB } from "../src/infrastructure/database/schema";

import type { StreamMessage } from "../src/interfaces/ws/broadcaster";

describe("WebSocket Broadcast Server (One-Way Outbound Telemetry)", () => {
  let db: Kysely<HarbingerDB>;
  let journal: JournalService;
  let server: WebSocketStreamServer;
  let openClients: WebSocket[] = [];

  beforeEach(async () => {
    db = getDatabase(":memory:");
    journal = new JournalService(db);
    // Use ephemeral port 0 to prevent conflicts
    server = new WebSocketStreamServer(journal, 0, "127.0.0.1", {
      heartbeatIntervalMs: 500,
      backfillLimit: 10,
    });
    await server.start();
    openClients = [];
  });

  afterEach(async () => {
    for (const c of openClients) {
      try {
        c.terminate();
      } catch {
        // Safe catch
      }
    }
    openClients = [];
    await server.stop();
    await closeDatabase();
  });

  interface TestClient {
    ws: WebSocket;
    waitForMessage: (timeoutMs?: number) => Promise<StreamMessage>;
  }

  function createClient(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      openClients.push(ws);
      const queue: StreamMessage[] = [];
      const waiters: Array<(msg: StreamMessage) => void> = [];

      ws.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (waiters.length > 0) {
            const waiter = waiters.shift()!;
            waiter(parsed);
          } else {
            queue.push(parsed);
          }
        } catch {
          // Safe catch on non-JSON
        }
      });

      const client: TestClient = {
        ws,
        waitForMessage: (timeoutMs = 2000) => {
          if (queue.length > 0) {
            return Promise.resolve(queue.shift()!);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const idx = waiters.indexOf(res);
              if (idx >= 0) waiters.splice(idx, 1);
              rej(new Error("Timeout waiting for WebSocket message"));
            }, timeoutMs);
            waiters.push((msg) => {
              clearTimeout(timer);
              res(msg);
            });
          });
        },
      };

      ws.on("open", () => resolve(client));
      ws.on("error", reject);
    });
  }

  it("transmits INIT_BACKFILL burst immediately upon client connection", async () => {
    // Populate journal with 2 thoughts
    await journal.recordThought({
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "boot",
      thought: "Initial boot thought 1",
      confidenceScore: 1.0,
    });

    await journal.recordThought({
      level: "ALERT",
      type: "THRESHOLD_ANALYSIS",
      source: "reflex",
      thought: "Initial alert thought 2",
      confidenceScore: 0.9,
    });

    const port = server.getPort();
    const client = await createClient(port);

    const firstMessage = await client.waitForMessage();

    assert.equal(firstMessage.type, "INIT_BACKFILL");
    const data = firstMessage.data as { thoughts: Array<{ thought: string }> };
    assert.ok(Array.isArray(data.thoughts));
    assert.equal(data.thoughts.length, 2);
    assert.equal(data.thoughts[0].thought, "Initial alert thought 2"); // DESC order
  });

  it("broadcasts live JOURNAL_ENTRY thoughts to connected clients", async () => {
    const port = server.getPort();
    const client = await createClient(port);

    // Drain initial INIT_BACKFILL message
    const initMessage = await client.waitForMessage();
    assert.equal(initMessage.type, "INIT_BACKFILL");

    // Record a new thought in JournalService
    await journal.recordThought({
      level: "ANOMALY",
      type: "CONTAGION_ANALYSIS",
      source: "detective_agent",
      thought: "Elevated borrow velocity on place-aave-v3-core.",
      confidenceScore: 0.88,
    });

    const liveMessage = await client.waitForMessage();
    assert.equal(liveMessage.type, "JOURNAL_ENTRY");
    const liveData = liveMessage.data as { thought: string; level: string };
    assert.equal(liveData.thought, "Elevated borrow velocity on place-aave-v3-core.");
    assert.equal(liveData.level, "ANOMALY");
  });

  it("enforces Axiom 4.3 (One-Way Outbound): terminates connection with code 1008 on inbound frame", async () => {
    const port = server.getPort();
    const client = await createClient(port);

    // Wait for connection to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      client.ws.on("close", (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Client attempts to send an unauthenticated inbound command
    client.ws.send(JSON.stringify({ command: "settleMarket", marketId: "0xmalicious" }));

    const closeResult = await closePromise;
    assert.equal(closeResult.code, 1008); // Policy Violation
    assert.ok(closeResult.reason.includes("Policy Violation"));
  });

  it("reports server health status via getWsServerHealth", async () => {
    const port = server.getPort();
    const healthBefore = getWsServerHealth(server);
    assert.equal(healthBefore.status, "healthy");
    assert.equal(healthBefore.connectedClients, 0);
    assert.equal(healthBefore.port, port);

    const client = await createClient(port);
    const healthAfter = getWsServerHealth(server);
    assert.equal(healthAfter.connectedClients, 1);

    client.ws.close();
  });
});
