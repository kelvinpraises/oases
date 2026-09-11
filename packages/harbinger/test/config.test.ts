import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config";

describe("Configuration & Zod Validation", () => {
  it("loads default configuration successfully", () => {
    const config = loadConfig();
    assert.equal(config.rpcUrl, "http://127.0.0.1:8545");
    assert.equal(config.subgraphUrl, "http://127.0.0.1:8000/subgraphs/name/messari/aave-v3");
    assert.equal(config.chainId, 31337);
    assert.equal(config.dbPath, ".data/harbinger.db");
    assert.equal(config.wsPort, 4001);
    assert.equal(config.logLevel, "info");
  });

  it("applies overrides cleanly", () => {
    const config = loadConfig({
      rpcUrl: "http://localhost:8545",
      chainId: 1,
      logLevel: "debug",
      wsPort: 5005,
      operatorPrivateKey: "0x" + "a".repeat(64),
      marketRegistryAddress: "0x" + "1".repeat(40),
      vaultDriverAddress: "0x" + "2".repeat(40),
    });

    assert.equal(config.rpcUrl, "http://localhost:8545");
    assert.equal(config.chainId, 1);
    assert.equal(config.logLevel, "debug");
    assert.equal(config.wsPort, 5005);
    assert.equal(config.operatorPrivateKey, "0x" + "a".repeat(64));
    assert.equal(config.marketRegistryAddress, "0x" + "1".repeat(40));
    assert.equal(config.vaultDriverAddress, "0x" + "2".repeat(40));
  });

  it("fails fast on invalid URLs", () => {
    assert.throws(
      () => loadConfig({ rpcUrl: "not-a-valid-url" }),
      /url/i
    );
  });

  it("fails fast on malformed operator private key", () => {
    assert.throws(
      () => loadConfig({ operatorPrivateKey: "0x1234" }),
      /Must be a 32-byte hex private key/
    );
    assert.throws(
      () => loadConfig({ operatorPrivateKey: "not-hex" }),
      /Must be a 32-byte hex private key/
    );
  });

  it("fails fast on malformed EVM addresses", () => {
    assert.throws(
      () => loadConfig({ marketRegistryAddress: "0xbad" }),
      /Invalid EVM address/
    );
    assert.throws(
      () => loadConfig({ vaultDriverAddress: "0xzzz" }),
      /Invalid EVM address/
    );
  });

  it("fails fast on invalid log levels", () => {
    assert.throws(
      // @ts-expect-error testing invalid enum
      () => loadConfig({ logLevel: "trace" })
    );
  });
});
