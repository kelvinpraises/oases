import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { JournalService } from "../src/services/journal/journal-service";
import { getDatabase, closeDatabase } from "../src/infrastructure/database/connection";
import type { Kysely } from "kysely";
import type { HarbingerDB } from "../src/infrastructure/database/schema";
import type { JournalEntry } from "../src/models/JournalEntry";

describe("JournalService (Detective Thought Journal)", () => {
  let db: Kysely<HarbingerDB>;
  let journal: JournalService;

  beforeEach(() => {
    db = getDatabase(":memory:");
    journal = new JournalService(db);
  });

  afterEach(async () => {
    await closeDatabase();
  });

  it("records an immutable thought into SQLite and generates id and timestamp", async () => {
    const entry = await journal.recordThought({
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "test_runner",
      thought: "Daemon initialized successfully in test environment.",
      confidenceScore: 1.0,
      metadata: { env: "test", version: "1.0.0" },
    });

    assert.ok(entry.id.startsWith("jrn-"));
    assert.ok(entry.timestamp > 0);
    assert.equal(entry.level, "INFO");
    assert.equal(entry.type, "SYSTEM_LIFECYCLE");
    assert.equal(entry.source, "test_runner");
    assert.equal(entry.thought, "Daemon initialized successfully in test environment.");
    assert.equal(entry.confidenceScore, 1.0);
    assert.deepEqual(entry.metadata, { env: "test", version: "1.0.0" });

    // Verify persisted in SQLite
    const recent = await journal.getRecentThoughts(10);
    assert.equal(recent.length, 1);
    assert.equal(recent[0].id, entry.id);
    assert.deepEqual(recent[0].metadata, { env: "test", version: "1.0.0" });
  });

  it("preserves explicit id and timestamp when provided", async () => {
    const customTime = 1_700_000_000_000;
    const entry = await journal.recordThought({
      id: "jrn-custom-123",
      timestamp: customTime,
      level: "ALERT",
      type: "DEVIATION_ANALYSIS",
      source: "reflex_loop",
      thought: "Anomaly detected in pool reserves.",
      confidenceScore: 0.95,
    });

    assert.equal(entry.id, "jrn-custom-123");
    assert.equal(entry.timestamp, customTime);

    const recent = await journal.getRecentThoughts(10);
    assert.equal(recent[0].id, "jrn-custom-123");
    assert.equal(recent[0].timestamp, customTime);
  });

  it("filters thoughts by JournalLevel and respects limit", async () => {
    const baseTime = 1_700_000_000_000;

    await journal.recordThought({
      id: "jrn-1",
      timestamp: baseTime + 10,
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "test",
      thought: "Info thought 1",
      confidenceScore: 1.0,
    });

    await journal.recordThought({
      id: "jrn-2",
      timestamp: baseTime + 20,
      level: "ALERT",
      type: "THRESHOLD_ANALYSIS",
      source: "test",
      thought: "Alert thought 1",
      confidenceScore: 0.9,
    });

    await journal.recordThought({
      id: "jrn-3",
      timestamp: baseTime + 30,
      level: "RESOLUTION",
      type: "RESOLUTION_VERDICT",
      source: "test",
      thought: "Resolution thought 1",
      confidenceScore: 1.0,
    });

    await journal.recordThought({
      id: "jrn-4",
      timestamp: baseTime + 40,
      level: "ALERT",
      type: "CADENCE_DECISION",
      source: "test",
      thought: "Alert thought 2",
      confidenceScore: 0.95,
    });

    // Test limit
    const top2 = await journal.getRecentThoughts(2);
    assert.equal(top2.length, 2);
    assert.equal(top2[0].id, "jrn-4"); // Latest timestamp first
    assert.equal(top2[1].id, "jrn-3");

    // Test level filter: ALERT
    const alerts = await journal.getRecentThoughts(10, "ALERT");
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].id, "jrn-4");
    assert.equal(alerts[1].id, "jrn-2");

    // Test level filter: RESOLUTION
    const resolutions = await journal.getRecentThoughts(10, "RESOLUTION");
    assert.equal(resolutions.length, 1);
    assert.equal(resolutions[0].id, "jrn-3");
  });

  it("dispatches entries to active subscribers and handles unsubscription", async () => {
    const receivedEntries: JournalEntry[] = [];
    const unsubscribe = journal.subscribe((entry) => {
      receivedEntries.push(entry);
    });

    assert.equal(journal.getListenerCount(), 1);

    await journal.recordThought({
      level: "ANOMALY",
      type: "CONTAGION_ANALYSIS",
      source: "detective_agent",
      thought: "Contagion risk elevated across cluster.",
      confidenceScore: 0.85,
    });

    assert.equal(receivedEntries.length, 1);
    assert.equal(receivedEntries[0].thought, "Contagion risk elevated across cluster.");

    // Unsubscribe
    unsubscribe();
    assert.equal(journal.getListenerCount(), 0);

    await journal.recordThought({
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "test",
      thought: "Second thought after unsubscribe.",
      confidenceScore: 1.0,
    });

    // Received entries count should still be 1
    assert.equal(receivedEntries.length, 1);
  });

  it("protects dispatch loop against throwing subscriber listeners", async () => {
    journal.subscribe(() => {
      throw new Error("Faulty subscriber exploded!");
    });

    let healthyReceived = false;
    journal.subscribe(() => {
      healthyReceived = true;
    });

    // Recording must not throw
    const entry = await journal.recordThought({
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "test",
      thought: "Safe dispatch test",
      confidenceScore: 1.0,
    });

    assert.ok(entry.id.startsWith("jrn-"));
    assert.equal(healthyReceived, true);
  });
});
