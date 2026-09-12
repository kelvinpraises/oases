import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  priceOf,
  segMath,
  projectShares,
  sharesFromG,
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

  it("projectShares calculates sharesFromG(userRate, dG, 0n) with WAD division", () => {
    const pool = 10_000_000_000n;
    const sideRate = 20_000_000n;
    const userRate = 5_000_000n;
    const dt = 60n;

    const { dG } = segMath({ pool, sideRate, dt });
    const userShares = projectShares({ pool, sideRate, userRate, dt });

    assert.equal(userShares, sharesFromG(userRate, dG, 0n));
    assert.equal(userShares, (userRate * dG) / WAD);
    assert.ok(userShares > 0n);
    // Sanity check: 5 USDC/sec for 60s is 300 USDC deposited at ~0.20 USDC price -> ~1,500 shares (1.5e9)
    assert.ok(userShares > 1_000_000_000n && userShares < 2_000_000_000n);
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
    const relativeError = (Number(diff) / Number(combined.dG)) * 100;
    assert.ok(relativeError < 0.0001, `Relative error too high: ${relativeError}%`);
  });

  it("projectShares accounts for gPaid, lastAdvanceMs, maxEndMs, and resolvedAtMs", () => {
    const input = {
      board: {
        pool: 5_000_000_000n,
        sideRate: 10_000_000n,
        g: 100_000_000_000_000_000n, // 0.1 WAD
        lastAdvanceMs: 1_000_000,
      },
      position: {
        rate: 2_000_000n,
        gPaid: 80_000_000_000_000_000n, // 0.08 WAD (funder entered earlier)
        maxEndMs: 1_060_000, // stops after 60s
        depleted: false,
      },
      atMs: 1_050_000, // 50 seconds into projection
      resolvedAtMs: 1_100_000,
    };

    const projected = projectShares(input);
    assert.ok(projected > 0n);

    // If freezeMs <= lastAdvanceMs, returns sharesFromG(rate, board.g, gPaid)
    const instantInput = {
      ...input,
      atMs: 1_000_000,
    };
    const instantProjected = projectShares(instantInput);
    assert.equal(instantProjected, sharesFromG(input.position.rate, input.board.g, input.position.gPaid));
  });

  it("projectShares automatically handles Unix timestamps in seconds (< 1e10)", () => {
    const inputMs = {
      board: {
        pool: 5_000_000_000n,
        sideRate: 10_000_000n,
        g: 0n,
        lastAdvanceMs: 1_700_000_000_000, // ms
      },
      position: {
        rate: 2_000_000n,
        gPaid: 0n,
        maxEndMs: 1_700_000_060_000, // 60s
        depleted: false,
      },
      atMs: 1_700_000_030_000, // 30s
    };

    const inputSeconds = {
      board: {
        pool: 5_000_000_000n,
        sideRate: 10_000_000n,
        g: 0n,
        lastAdvanceMs: 1_700_000_000, // seconds
      },
      position: {
        rate: 2_000_000n,
        gPaid: 0n,
        maxEndMs: 1_700_000_060, // seconds
        depleted: false,
      },
      atMs: 1_700_000_030, // seconds
    };

    const sharesMs = projectShares(inputMs);
    const sharesSec = projectShares(inputSeconds);

    assert.ok(sharesMs > 0n);
    assert.equal(sharesMs, sharesSec, "Projections must match whether timestamps are in seconds or ms");
  });

  it("projectShares preserves sharesAccrued when position is depleted or paused", () => {
    // 50 shares banked (50 * 1e6 * 1e18 WAD-scaled)
    const bankedSharesWad = 50_000_000n * WAD;

    const depletedInput = {
      board: {
        pool: 5_000_000_000n,
        sideRate: 0n,
        g: 100_000_000_000_000_000n,
        lastAdvanceMs: 1_700_000_000,
      },
      position: {
        rate: 0n,
        gPaid: 100_000_000_000_000_000n,
        sharesAccrued: bankedSharesWad,
        depleted: true,
      },
      atMs: 1_700_000_100,
    };

    const shares = projectShares(depletedInput);
    assert.equal(shares, 50_000_000n, "Must return banked sharesAccrued when depleted");

    // When actively accumulating on top of banked shares
    const activeWithBanked = {
      board: {
        pool: 5_000_000_000n,
        sideRate: 10_000_000n,
        g: 0n,
        lastAdvanceMs: 1_700_000_000,
      },
      position: {
        rate: 2_000_000n,
        gPaid: 0n,
        sharesAccrued: bankedSharesWad,
        maxEndMs: 1_700_000_060,
        depleted: false,
      },
      atMs: 1_700_000_030,
    };

    const totalProjected = projectShares(activeWithBanked);
    assert.ok(totalProjected > 50_000_000n, "Total projected shares must exceed banked shares");
  });

  it("projectShares continuously projects up to maxEndMs when stream depleted before on-chain advance", () => {
    // Funder streams at 2 USDC/sec (2_000_000n).
    // Board advanced at t = 1,000s. Funder deposit exhausts at maxEnd = 1,020s (20s duration).
    // At current time t = 1,050s, position is flagged depleted on-chain/client, but on-chain advance hasn't occurred.
    const inputDepletedAtFuture = {
      board: {
        pool: 5_000_000_000n,
        sideRate: 2_000_000n,
        g: 0n,
        lastAdvanceMs: 1_000_000,
      },
      position: {
        rate: 2_000_000n,
        gPaid: 0n,
        sharesAccrued: 0n,
        maxEndMs: 1_020_000, // 20s after last advance
        depleted: true, // flagged depleted
      },
      atMs: 1_050_000, // current time is 50s after last advance
    };

    // Exactly at maxEndMs (20s)
    const inputAtMaxEnd = {
      ...inputDepletedAtFuture,
      atMs: 1_020_000,
    };

    const sharesAt50s = projectShares(inputDepletedAtFuture);
    const sharesAt20s = projectShares(inputAtMaxEnd);

    // Shares must project exactly for the 20 active seconds, and freeze without accruing further between 20s and 50s
    assert.ok(sharesAt20s > 0n, "Shares must accrue for active stream interval");
    assert.equal(sharesAt50s, sharesAt20s, "Accrual must freeze at maxEndMs when stream is depleted");

    // If freezeMs <= lastAdvanceMs, returns banked shares immediately
    const inputPastAdvance = {
      ...inputDepletedAtFuture,
      board: {
        ...inputDepletedAtFuture.board,
        lastAdvanceMs: 1_025_000, // on-chain advance already passed maxEnd
      },
    };
    const sharesPast = projectShares(inputPastAdvance);
    assert.equal(sharesPast, 0n, "Must return banked shares when freezeMs <= lastAdvanceMs");
  });
});

