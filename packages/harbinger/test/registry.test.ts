import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RATIO_HASH,
  DELTA_HASH,
  THRESHOLD_HASH,
  getSafeToolByHash,
  hasSafeTool,
  registerSafeTool,
  SecurityBlockError,
} from "../src/services/oracle";

describe("Tool Registry & Content Hashing Whitelist", () => {
  it("pre-registers canonical starter tools with valid SHA-256 hashes", () => {
    assert.ok(RATIO_HASH && RATIO_HASH.length === 64);
    assert.ok(DELTA_HASH && DELTA_HASH.length === 64);
    assert.ok(THRESHOLD_HASH && THRESHOLD_HASH.length === 64);

    assert.equal(hasSafeTool(RATIO_HASH), true);
    assert.equal(hasSafeTool(DELTA_HASH), true);
    assert.equal(hasSafeTool(THRESHOLD_HASH), true);
  });

  it("retrieves approved tools by their SHA-256 hash", () => {
    const ratioEntry = getSafeToolByHash(RATIO_HASH);
    assert.equal(ratioEntry.id, "ratio");
    assert.equal(typeof ratioEntry.fn, "function");

    const deltaEntry = getSafeToolByHash(DELTA_HASH);
    assert.equal(deltaEntry.id, "delta");

    const thresholdEntry = getSafeToolByHash(THRESHOLD_HASH);
    assert.equal(thresholdEntry.id, "threshold");
  });

  it("blocks and throws SecurityBlockError for unknown tool hashes", () => {
    const fakeHash = "a".repeat(64);
    assert.equal(hasSafeTool(fakeHash), false);
    assert.throws(() => getSafeToolByHash(fakeHash), SecurityBlockError);
  });

  it("allows registering custom pure functions and computes deterministic SHA-256", () => {
    const customCode = `
      function add(inputs) {
        return inputs.a + inputs.b;
      }
    `;
    const hash = registerSafeTool(
      "add",
      "Custom Adder",
      customCode,
      (inputs) => Number(inputs.a) + Number(inputs.b)
    );
    assert.equal(hash.length, 64);
    assert.equal(hasSafeTool(hash), true);

    const tool = getSafeToolByHash(hash);
    assert.equal(tool.fn({ a: 10, b: 20 }, {}), 30);
  });
});
