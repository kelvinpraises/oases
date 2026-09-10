import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePrecedence,
  buildReplayTicket,
  verifyReplayTicket,
} from "../src/proof/index";
import { SolverManifest } from "../src/pipeline/types";

describe("Hierarchical Precedence Proof & Replay Ticket", () => {
  const startBlock = 20000000;
  const deadlineBlock = 20000300;

  describe("Precedence State Machine Ω(Vi)", () => {
    it("confirms breach when within window and 2-block debounce satisfied", () => {
      const proof = evaluatePrecedence({
        breachBlock: 20000120,
        startBlock,
        deadlineBlock,
        abortTimestamp: null,
        consecutiveBreachBlocks: 2,
        requiredDebounce: 2,
      });

      assert.equal(proof.valid, true);
      assert.equal(proof.decision, "RESOLVED_YES");
      assert.equal(proof.withinWindow, true);
      assert.equal(proof.notAborted, true);
      assert.equal(proof.debounceVerified, true);
    });

    it("rejects 1-block flashloan spike (debounce check failure)", () => {
      const proof = evaluatePrecedence({
        breachBlock: 20000120,
        startBlock,
        deadlineBlock,
        abortTimestamp: null,
        consecutiveBreachBlocks: 1, // Only 1 block!
        requiredDebounce: 2,
      });

      assert.equal(proof.valid, false);
      assert.equal(proof.debounceVerified, false);
      assert.equal(proof.decision, "RESOLVED_NO");
      assert.match(proof.reason, /filtering atomic flashloan spike/);
    });

    it("resolves NO if breach occurs after deadline", () => {
      const proof = evaluatePrecedence({
        breachBlock: 20000305,
        startBlock,
        deadlineBlock,
        abortTimestamp: null,
        consecutiveBreachBlocks: 2,
      });

      assert.equal(proof.valid, false);
      assert.equal(proof.decision, "RESOLVED_NO");
      assert.match(proof.reason, /exceeded deadline/);
    });

    it("resolves NO if breach occurs before start block", () => {
      const proof = evaluatePrecedence({
        breachBlock: 19999999,
        startBlock,
        deadlineBlock,
        abortTimestamp: null,
        consecutiveBreachBlocks: 2,
      });

      assert.equal(proof.valid, false);
      assert.equal(proof.decision, "RESOLVED_NO");
      assert.match(proof.reason, /before start block/);
    });

    it("returns REFUNDED if emergency abort occurred prior to breach", () => {
      const proof = evaluatePrecedence({
        breachBlock: 20000150,
        startBlock,
        deadlineBlock,
        abortTimestamp: 20000100, // Aborted 50 blocks prior
        consecutiveBreachBlocks: 2,
      });

      assert.equal(proof.valid, false);
      assert.equal(proof.notAborted, false);
      assert.equal(proof.decision, "REFUNDED");
    });
  });

  describe("Replay Ticket Generation & Verification", () => {
    const manifest: SolverManifest = {
      version: "1.0.0",
      query: "query CheckWhale { account(id: \"0x7a...\") { totalCollateralUSD totalDebtUSD } }",
      timeBounds: { startBlock, deadlineBlock },
      globals: {
        collateral: "data.account.totalCollateralUSD",
        debt: "data.account.totalDebtUSD",
      },
      tree: [
        {
          type: "expr",
          id: "health",
          formula: "collateral / debt <= 1.0",
          output: "isBreached",
        },
      ],
      resolution: {
        triggerVariable: "isBreached",
        debounceBlocks: 2,
      },
    };

    const validProof = evaluatePrecedence({
      breachBlock: 20000120,
      startBlock,
      deadlineBlock,
      abortTimestamp: null,
      consecutiveBreachBlocks: 2,
      requiredDebounce: 2,
    });

    const blockSnapshots = [
      {
        blockNumber: 20000120,
        inputs: { collateral: 1000, debt: 1500 },
        intermediate: { healthRatio: 0.6666 },
        trigger: true,
      },
      {
        blockNumber: 20000121,
        inputs: { collateral: 1000, debt: 1550 },
        intermediate: { healthRatio: 0.6451 },
        trigger: true,
      },
    ];

    it("builds and verifies a valid Replay Ticket", () => {
      const ticket = buildReplayTicket({
        vaultId: "0x4b7c89a0b123456789abcdef0123456789abcdef",
        manifest,
        precedenceProof: validProof,
        blockSnapshots,
        timestamp: 1725960000,
      });

      assert.equal(ticket.decision, "RESOLVED_YES");
      assert.equal(ticket.blockSnapshots.length, 2);

      const verification = verifyReplayTicket(ticket);
      assert.equal(verification.valid, true);
      assert.equal(verification.decision, "RESOLVED_YES");
      assert.equal(verification.errors.length, 0);
    });

    it("detects tampered non-consecutive block sequence", () => {
      const tamperedSnapshots = [
        { ...blockSnapshots[0], blockNumber: 20000120 },
        { ...blockSnapshots[1], blockNumber: 20000125 }, // Gap!
      ];

      const ticket = buildReplayTicket({
        vaultId: "0x4b7c",
        manifest,
        precedenceProof: validProof,
        blockSnapshots: tamperedSnapshots,
      });

      const verification = verifyReplayTicket(ticket);
      assert.equal(verification.valid, false);
      assert.match(verification.errors[0], /Non-consecutive block sequence/);
    });

    it("detects snapshot where condition did not trigger", () => {
      const falseSnapshots = [
        blockSnapshots[0],
        { ...blockSnapshots[1], trigger: false },
      ];

      const ticket = buildReplayTicket({
        vaultId: "0x4b7c",
        manifest,
        precedenceProof: validProof,
        blockSnapshots: falseSnapshots,
      });

      const verification = verifyReplayTicket(ticket);
      assert.equal(verification.valid, false);
      assert.match(verification.errors[0], /did not trigger breach/);
    });
  });
});
