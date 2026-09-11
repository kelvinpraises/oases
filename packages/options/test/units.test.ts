import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  usdcToRaw,
  rawToUsdc,
  rateToPerSec,
  perSecToRate,
  sharesToNumber,
  formatUsdc
} from "../src/units.js";

describe("unit conversion & formatting parity", () => {
  it("converts float USDC to raw 6-decimal integer and back", () => {
    assert.equal(usdcToRaw(20.5), 20_500_000n);
    assert.equal(usdcToRaw(100), 100_000_000n);
    assert.equal(usdcToRaw(0.000001), 1n);
    assert.equal(usdcToRaw(0), 0n);

    assert.equal(rawToUsdc(20_500_000n), 20.5);
    assert.equal(rawToUsdc(100_000_000n), 100);
    assert.equal(rawToUsdc(1n), 0.000001);
    assert.equal(rawToUsdc(0n), 0);
  });

  it("converts rate between float USDC/sec and 6-decimal raw integer rate", () => {
    const oneUsdcSec = 1_000_000n; // 1.0 USDC/sec
    assert.equal(rateToPerSec(oneUsdcSec), 1.0);
    assert.equal(rateToPerSec(oneUsdcSec / 2n), 0.5);

    assert.equal(perSecToRate(1.0), oneUsdcSec);
    assert.equal(perSecToRate(0.5), oneUsdcSec / 2n);
    assert.equal(perSecToRate(2.5), (oneUsdcSec * 5n) / 2n);
  });

  it("converts 6-decimal shares to human readable float", () => {
    const oneShare = 1_000_000n; // 1.0 share (SHARE_SCALE = 1e6)
    assert.equal(sharesToNumber(oneShare), 1.0);
    assert.equal(sharesToNumber(oneShare * 100n), 100.0);
    assert.equal(sharesToNumber(0n), 0.0);
  });

  it("formats USDC with currency sign and two decimals by default", () => {
    assert.equal(formatUsdc(20.5), "$20.50");
    assert.equal(formatUsdc(1000), "$1,000.00");
    assert.equal(formatUsdc(0), "$0.00");

    // Raw bigint amounts (6 decimals)
    assert.equal(formatUsdc(20_500_000n), "$20.50");
    assert.equal(formatUsdc(1_000_000_000n), "$1,000.00");
    assert.equal(formatUsdc(0n), "$0.00");

    // Custom decimal precision
    assert.equal(formatUsdc(20.1234, 4), "$20.1234");
  });
});
