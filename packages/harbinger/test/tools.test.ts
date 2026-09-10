import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ratioFn,
  ratioTool,
  deltaFn,
  deltaTool,
  thresholdFn,
  thresholdTool,
} from "../src/tools/index";

describe("Community Indicator Tools", () => {
  describe("ratio tool", () => {
    it("computes simple proportion correctly", () => {
      const result = ratioFn({ num: 1000, den: 2000 });
      assert.equal(result, 0.5);
    });

    it("applies scale factor correctly", () => {
      const result = ratioFn({ num: 1000, den: 2000 }, { scale: 100 });
      assert.equal(result, 50);
    });

    it("handles large BigInt integer strings without precision loss", () => {
      const num = "10000000000000000000"; // 10 ETH
      const den = "20000000000000000000"; // 20 ETH
      const result = ratioFn({ num, den }, { scale: "1000000000000000000" }); // 1 WAD scale
      assert.equal(result, "500000000000000000"); // 0.5 WAD
    });

    it("throws on division by zero", () => {
      assert.throws(() => ratioFn({ num: 100, den: 0 }), /Division by zero/);
      assert.throws(() => ratioFn({ num: 100, den: "0" }), /Division by zero/);
    });

    it("executes via ToolDefinition interface", () => {
      const ctx = { signals: { collateral: 1200, debt: 1500 } };
      const res = ratioTool.execute({ num: "collateral", den: "debt" }, ctx);
      assert.equal(res, 0.8);
    });
  });

  describe("delta velocity tool", () => {
    it("computes absolute difference", () => {
      const res = deltaFn({ current: 150, previous: 100 }, { mode: "absolute" });
      assert.equal(res, 50);
    });

    it("computes percentage rate of change", () => {
      const res = deltaFn({ current: 80, previous: 100 }, { mode: "percentage" });
      assert.equal(res, -0.2); // -20% drop
    });

    it("throws on invalid non-numeric inputs", () => {
      assert.throws(() => deltaFn({ current: "invalid", previous: 100 }), /Invalid numerical input/);
    });

    it("throws on division by zero in percentage mode", () => {
      assert.throws(() => deltaFn({ current: 50, previous: 0 }, { mode: "percentage" }), /Division by zero/);
    });

    it("executes via ToolDefinition interface", () => {
      const ctx = { signals: { balance_now: 80, balance_prev: 100 } };
      const res = deltaTool.execute({ current: "balance_now", previous: "balance_prev", mode: "percentage" }, ctx);
      assert.equal(res, -0.2);
    });
  });

  describe("threshold invariant gate", () => {
    it("evaluates <= correctly", () => {
      assert.equal(thresholdFn({ signal: 0.95 }, { operator: "<=", target: 1.0 }), true);
      assert.equal(thresholdFn({ signal: 1.05 }, { operator: "<=", target: 1.0 }), false);
      assert.equal(thresholdFn({ signal: 1.0 }, { operator: "<=", target: 1.0 }), true);
    });

    it("evaluates >= correctly", () => {
      assert.equal(thresholdFn({ signal: 0.85 }, { operator: ">=", target: 0.85 }), true);
      assert.equal(thresholdFn({ signal: 0.80 }, { operator: ">=", target: 0.85 }), false);
    });

    it("evaluates < and > strictly", () => {
      assert.equal(thresholdFn({ signal: 1.0 }, { operator: "<", target: 1.0 }), false);
      assert.equal(thresholdFn({ signal: 0.99 }, { operator: "<", target: 1.0 }), true);
      assert.equal(thresholdFn({ signal: 1.01 }, { operator: ">", target: 1.0 }), true);
    });

    it("evaluates == and != correctly", () => {
      assert.equal(thresholdFn({ signal: "ACTIVE" }, { operator: "==", target: "ACTIVE" }), true);
      assert.equal(thresholdFn({ signal: "PAUSED" }, { operator: "==", target: "ACTIVE" }), false);
      assert.equal(thresholdFn({ signal: "PAUSED" }, { operator: "!=", target: "ACTIVE" }), true);
    });

    it("handles BigInt comparison for large integer strings", () => {
      const sig = "999999999999999999";
      const target = "1000000000000000000";
      assert.equal(thresholdFn({ signal: sig }, { operator: "<", target }), true);
      assert.equal(thresholdFn({ signal: target }, { operator: "<=", target }), true);
    });

    it("executes via ToolDefinition interface", () => {
      const ctx = { signals: { healthRatio: 0.88 } };
      const res = thresholdTool.execute({ signal: "healthRatio", operator: "<=", target: 1.0 }, ctx);
      assert.equal(res, true);
    });
  });
});
