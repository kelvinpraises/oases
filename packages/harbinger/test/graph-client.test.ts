import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GraphClient } from "../src/services/graph/graph-client";
import { FreshnessService } from "../src/services/graph/freshness-service";
import { IndexerLagError, GraphQueryError } from "../src/services/graph/types";

describe("Stateless Time-Travel Graph Client & Freshness Gate", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("FreshnessService", () => {
    const service = new FreshnessService();

    it("passes when indexer block is equal to or greater than target block", () => {
      assert.doesNotThrow(() => {
        service.assertFreshness(
          { block: { number: 20000000 } },
          20000000,
          "http://graph.example.com",
        );
      });
      assert.doesNotThrow(() => {
        service.assertFreshness(
          { block: { number: 20000005 } },
          20000000,
          "http://graph.example.com",
        );
      });
    });

    it("throws IndexerLagError when indexer block is behind target block", () => {
      assert.throws(
        () => {
          service.assertFreshness(
            { block: { number: 19999990 } },
            20000000,
            "http://graph.example.com",
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof IndexerLagError);
          assert.equal(err.targetBlock, 20000000);
          assert.equal(err.indexerBlock, 19999990);
          assert.equal(err.subgraphUrl, "http://graph.example.com");
          return true;
        },
      );
    });

    it("throws when _meta is missing or malformed", () => {
      assert.throws(() => {
        service.assertFreshness(undefined, 20000000, "http://graph.example.com");
      }, /Missing _meta\.block/);
    });

    it("calculates exponential backoff delay with jitter within bounds", () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const delay = service.calculateBackoffMs(attempt, 100, 1000);
        assert.ok(delay >= 100);
        assert.ok(delay <= 1200); // 1000 max + 200 max jitter
      }
    });
  });

  describe("GraphClient Query Formatting & Dual Pinning", () => {
    const client = new GraphClient("http://graph.example.com/subgraphs/name/aave");

    it("formats query with dual block pinning: _meta at root and block: B on entity", () => {
      const rawQuery = `account(id: "0x7a") { healthFactor totalCollateralUSD }`;
      const formatted = client.formatTimeTravelQuery(rawQuery, 20000100);

      assert.ok(formatted.includes("_meta { block { number hash timestamp } }"));
      assert.ok(formatted.includes('account(id: "0x7a", block: { number: 20000100 })'));
      assert.ok(formatted.startsWith("query TimeTravelBlock_20000100"));
    });

    it("preserves block pin if query already explicitly contains block argument", () => {
      const prePinned = `query CustomQuery {\n  account(id: "0x7a", block: { number: 20000100 }) { healthFactor }\n}`;
      const formatted = client.formatTimeTravelQuery(prePinned, 20000100);

      assert.ok(formatted.includes("_meta { block { number hash timestamp } }"));
      assert.ok(formatted.includes('account(id: "0x7a", block: { number: 20000100 })'));
    });

    it("coalesces multiple child vault queries into an aliased document", () => {
      const queries = [
        { alias: "vault_whale", entityQuery: `account(id: "0x7a") { healthFactor }` },
        { alias: "vault_pool", entityQuery: `market(id: "0x87") { utilization }` },
      ];

      const coalesced = client.coalesceClusterQuery(queries);
      assert.ok(coalesced.includes('vault_whale: account(id: "0x7a") { healthFactor }'));
      assert.ok(coalesced.includes('vault_pool: market(id: "0x87") { utilization }'));
    });
  });

  describe("GraphClient Network Execution & Retries", () => {
    const client = new GraphClient("http://graph.example.com/subgraphs/name/aave");

    it("executes queryBlock successfully and returns data with indexer block height", async () => {
      globalThis.fetch = async (input, init) => {
        const body = JSON.parse(init?.body as string);
        assert.ok(body.query.includes("_meta"));

        return new Response(
          JSON.stringify({
            data: {
              account: { healthFactor: "0.95" },
            },
            _meta: {
              block: { number: 20000105, hash: "0xabc", timestamp: 1726000000 },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const result = await client.queryBlock<{ account: { healthFactor: string } }>(
        `account(id: "0x7a") { healthFactor }`,
        20000100,
      );

      assert.equal(result.indexerBlock, 20000105);
      assert.equal(result.data.account.healthFactor, "0.95");
    });

    it("throws GraphQueryError on GraphQL error envelopes", async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            errors: [{ message: "Cannot query field invalidField on type Account" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      await assert.rejects(
        () => client.queryBlock(`account(id: "0x7a") { invalidField }`, 20000100),
        (err: unknown) => {
          assert.ok(err instanceof GraphQueryError);
          assert.ok(err.message.includes("Cannot query field invalidField"));
          return true;
        },
      );
    });

    it("retries on indexer lag and succeeds when indexer advances", async () => {
      let attempts = 0;
      globalThis.fetch = async () => {
        attempts++;
        if (attempts === 1) {
          // Attempt 1: Indexer lagging behind target block 20000100
          return new Response(
            JSON.stringify({
              data: { account: { healthFactor: "1.2" } },
              _meta: { block: { number: 20000095 } },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // Attempt 2: Indexer caught up to 20000101
        return new Response(
          JSON.stringify({
            data: { account: { healthFactor: "0.92" } },
            _meta: { block: { number: 20000101 } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      };

      const result = await client.queryBlock<{ account: { healthFactor: string } }>(
        `account(id: "0x7a") { healthFactor }`,
        20000100,
        { retries: 2 },
      );

      assert.equal(attempts, 2);
      assert.equal(result.indexerBlock, 20000101);
      assert.equal(result.data.account.healthFactor, "0.92");
    });
  });
});
