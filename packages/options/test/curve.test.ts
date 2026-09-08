import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  priceOf,
  segMath,
  projectShares,
  BASE_PRICE,
  CURVE_K,
  SHARE_SCALE,
  WAD
} from "../src/curve";

describe("curve TS parity", () => {
  it("constants match BondingBoard.sol specification", () => {
    assert.equal(BASE_PRICE, 100_000n);
    assert.equal(CURVE_K, 10_000_000_000n);
    assert.equal(SHARE_SCALE, 1_000_000n);
    assert.equal(WAD, 10n ** 18n);
  });

  it("priceOf increases monotonically with pool size", () => {
    const p0 = priceOf(0n);
    const p1 = priceOf(1_000_000_000n); // 1,000 USDC
    const p2 = priceOf(10_000_000_000n); // 10,000 USDC

    assert.equal(p0, BASE_PRICE);
    assert.ok(p1 > p0);
    assert.ok(p2 > p1);
    assert.equal(p2, BASE_PRICE + BASE_PRICE); // At pool == CURVE_K, price doubles
  });

  it("segMath handles zero duration or zero rate cleanly", () => {
    const res1 = segMath({ pool: 1_000_000_000n, sideRate: 0n, dt: 100n });
    assert.equal(res1.newPool, 1_000_000_000n);
    assert.equal(res1.dG, 0n);

    const res2 = segMath({ pool: 1_000_000_000n, sideRate: 10_000_000n, dt: 0n });
    assert.equal(res2.newPool, 1_000_000_000n);
    assert.equal(res2.dG, 0n);
  });

  it("segMath computes pool advance and positive dG", () => {
    const pool = 5_000_000_000n;
    const sideRate = 50_000_000n; // 50 USDC/sec
    const dt = 120n;

    const res = segMath({ pool, sideRate, dt });
    assert.equal(res.newPool, pool + sideRate * dt);
    assert.ok(res.dG > 0n);
  });

  it("projectShares calculates userRate * dG", () => {
    const pool = 10_000_000_000n;
    const sideRate = 20_000_000n;
    const userRate = 5_000_000n;
    const dt = 60n;

    const { dG } = segMath({ pool, sideRate, dt });
    const userShares = projectShares({ pool, sideRate, userRate, dt });

    assert.equal(userShares, userRate * dG);
    assert.ok(userShares > 0n);
  });

  it("telescoping linearity in TS matches segment addition within rounding tolerance", () => {
    const pool0 = 10_000_000_000n;
    const sideRate = 25_000_000n;
    const dt1 = 600n;
    const dt2 = 1200n;

    const seg1 = segMath({ pool: pool0, sideRate, dt: dt1 });
    const seg2 = segMath({ pool: seg1.newPool, sideRate, dt: dt2 });
    const combined = segMath({ pool: pool0, sideRate, dt: dt1 + dt2 });

    assert.equal(seg2.newPool, combined.newPool);

    const sumDG = seg1.dG + seg2.dG;
    const diff = sumDG > combined.dG ? sumDG - combined.dG : combined.dG - sumDG;
    // Relative difference should be negligible (< 0.0001%)
    const relativeError = (Number(diff) / Number(combined.dG)) * 100;
    assert.ok(relativeError < 0.0001, `Relative error too high: ${relativeError}%`);
  });
});
