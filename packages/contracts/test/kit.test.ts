import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evmAbis,
  abis,
  staticAddresses,
  getContractAddresses,
  contract,
  loadDeploymentOutput,
  type EvmContract
} from "../src/index.js";

const EXPECTED_CONTRACTS: readonly EvmContract[] = [
  "protocol",
  "marketRegistry",
  "vault",
  "dripsStreaming",
  "caller",
  "marketDriver",
  "vaultDriver",
  "mockUsdc"
];

describe("Typed Contract Kit", () => {
  it("exports ABIs for all expected EVM contracts including agentRegistry", () => {
    const allContracts: readonly EvmContract[] = [...EXPECTED_CONTRACTS, "agentRegistry"];
    for (const name of allContracts) {
      assert.ok(evmAbis[name], `Missing ABI for ${name}`);
      assert.ok(Array.isArray(evmAbis[name]), `ABI for ${name} should be an array`);
      assert.ok(evmAbis[name].length > 0, `ABI for ${name} should not be empty`);
    }
    assert.equal(abis, evmAbis);
  });

  it("exports static deployment addresses for localhost with all 8 contracts", () => {
    const local = staticAddresses.localhost;
    assert.ok(local, "Missing static localhost addresses");
    for (const name of EXPECTED_CONTRACTS) {
      assert.ok(local[name], `Missing static address for ${name}`);
      assert.match(local[name], /^0x[0-9a-fA-F]{40}$/, `Invalid address format for ${name}`);
    }
  });

  it("reads dynamic deployment addresses from disk for localhost", () => {
    const dynamic = getContractAddresses("localhost");
    assert.ok(dynamic, "Missing dynamic localhost addresses");
    for (const name of EXPECTED_CONTRACTS) {
      assert.ok(dynamic[name], `Missing dynamic address for ${name}`);
      assert.match(dynamic[name], /^0x[0-9a-fA-F]{40}$/, `Invalid address format for ${name}`);
    }
    assert.deepEqual(dynamic, staticAddresses.localhost);
  });

  it("loads raw deployment output snapshot", () => {
    const output = loadDeploymentOutput("localhost");
    assert.equal(output.chain, "localhost");
    assert.equal(output.chainId, 31337);
    assert.ok(output.scopes.streaming);
    assert.ok(output.scopes.protocol);
    assert.ok(output.scopes.wire);
    assert.equal(output.scopes.streaming.status, "completed");
    assert.equal(output.scopes.protocol.status, "completed");
    assert.equal(output.scopes.wire.status, "completed");
  });

  it("resolves contract descriptor with ABI and address", () => {
    const v = contract("vault");
    assert.equal(v.abi, evmAbis.vault);
    assert.equal(v.address, staticAddresses.localhost.vault);

    const p = contract("protocol");
    assert.equal(p.abi, evmAbis.protocol);
    assert.equal(p.address, staticAddresses.localhost.protocol);
  });
});
