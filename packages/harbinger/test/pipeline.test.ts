import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractSignals,
  ExtractionError,
  compileSolver,
  decompressSolver,
  CompilerError,
  runPipeline,
  SolverManifest,
} from "../src/pipeline/index";
import { RATIO_HASH, THRESHOLD_HASH } from "../src/tools/index";

describe("Circom-Style AST Pipeline & Dynamic Solver", () => {
  describe("JSONPath Extractor", () => {
    it("extracts nested properties correctly", () => {
      const mockGraphResponse = {
        data: {
          account: {
            id: "0x7a16ff8270133f063aab6c9977183d9e72835428",
            totalCollateralUSD: "1000000000",
            totalDebtUSD: "1500000000",
          },
          pools: [{ id: "0xpool1", liquidity: "50000000" }],
        },
      };

      const extracted = extractSignals(mockGraphResponse, {
        collateral: "data.account.totalCollateralUSD",
        debt: "data.account.totalDebtUSD",
        poolLiquidity: "data.pools[0].liquidity",
      });

      assert.deepEqual(extracted, {
        collateral: "1000000000",
        debt: "1500000000",
        poolLiquidity: "50000000",
      });
    });

    it("fails fast with ExtractionError if path does not exist", () => {
      const mockResponse = { data: { account: {} } };
      assert.throws(
        () => extractSignals(mockResponse, { missing: "data.account.nonExistentField" }),
        ExtractionError
      );
    });
  });

  describe("Static Compiler & Compression", () => {
    const validManifest: SolverManifest = {
      version: "1.0.0",
      query: "query CheckWhale($target: ID!) { account(id: $target) { totalCollateralUSD totalDebtUSD } }",
      globals: {
        collateral: "data.account.totalCollateralUSD",
        debt: "data.account.totalDebtUSD",
      },
      tree: [
        {
          type: "expr",
          id: "calc_health",
          formula: "collateral / debt",
          output: "healthRatio",
        },
        {
          type: "branch",
          id: "check_breach",
          condition: "healthRatio <= 1.0",
          then: [
            {
              type: "expr",
              id: "mark_breach",
              formula: "true",
              output: "isBreached",
            },
          ],
          else: [
            {
              type: "expr",
              id: "mark_safe",
              formula: "false",
              output: "isBreached",
            },
          ],
        },
      ],
      resolution: {
        triggerVariable: "isBreached",
        debounceBlocks: 2,
      },
    };

    it("compiles and decompresses with standard Base64 round-trip", () => {
      const { compiledConfig, hash } = compileSolver(validManifest, { compress: false });
      assert.ok(compiledConfig.length > 0);
      assert.equal(hash.length, 64);

      const decompressed = decompressSolver(compiledConfig);
      assert.deepEqual(decompressed, validManifest);
    });

    it("compiles and decompresses with zlib deflate round-trip", () => {
      const { compiledConfig } = compileSolver(validManifest, { compress: true });
      assert.ok(compiledConfig.startsWith("zlib:"));

      const decompressed = decompressSolver(compiledConfig);
      assert.deepEqual(decompressed, validManifest);
    });

    it("rejects manifest with syntax error in formula", () => {
      const badManifest: SolverManifest = {
        version: "1.0.0",
        globals: { a: "data.a" },
        tree: [
          {
            type: "expr",
            id: "bad_syntax",
            formula: "a / * 2",
            output: "health",
          },
        ],
        resolution: { triggerVariable: "health" },
      };

      assert.throws(() => compileSolver(badManifest), /Syntax error in formula/);
    });

    it("rejects manifest with undeclared variable in formula", () => {
      const badManifest: SolverManifest = {
        version: "1.0.0",
        globals: { collateral: "data.collateral" },
        tree: [
          {
            type: "expr",
            id: "bad_var",
            formula: "ghostCollateral / 2",
            output: "health",
          },
        ],
        resolution: { triggerVariable: "health" },
      };

      assert.throws(
        () => compileSolver(badManifest),
        /Formula references undeclared variable 'ghostCollateral'/
      );
    });

    it("rejects manifest with syntax error or undeclared variable in branch condition", () => {
      const badSyntaxBranch: SolverManifest = {
        version: "1.0.0",
        globals: { val: "data.val" },
        tree: [
          {
            type: "branch",
            id: "bad_branch_syntax",
            condition: "val > 10 && * /",
            then: [],
          },
          {
            type: "expr",
            id: "dummy",
            formula: "true",
            output: "trig",
          },
        ],
        resolution: { triggerVariable: "trig" },
      };
      assert.throws(() => compileSolver(badSyntaxBranch), /Syntax error in formula/);

      const badVarBranch: SolverManifest = {
        version: "1.0.0",
        globals: { val: "data.val" },
        tree: [
          {
            type: "branch",
            id: "bad_branch_var",
            condition: "ghostVar > 10",
            then: [],
          },
          {
            type: "expr",
            id: "dummy",
            formula: "true",
            output: "trig",
          },
        ],
        resolution: { triggerVariable: "trig" },
      };
      assert.throws(
        () => compileSolver(badVarBranch),
        /Formula references undeclared variable 'ghostVar'/
      );
    });

    it("rejects manifest with duplicate node IDs", () => {
      const badManifest: SolverManifest = {
        version: "1.0.0",
        globals: { a: "data.a" },
        tree: [
          {
            type: "expr",
            id: "same_id",
            formula: "a + 1",
            output: "out1",
          },
          {
            type: "expr",
            id: "same_id",
            formula: "out1 + 2",
            output: "out2",
          },
        ],
        resolution: { triggerVariable: "out2" },
      };

      assert.throws(() => compileSolver(badManifest), /Duplicate node id 'same_id'/);
    });

    it("rejects manifest with undeclared variable reference in call node", () => {
      const badManifest: SolverManifest = {
        version: "1.0.0",
        globals: { collateral: "data.collateral" },
        tree: [
          {
            type: "call",
            id: "bad_call",
            toolHash: RATIO_HASH,
            inputs: { num: "collateral", den: "undeclaredDebt" },
            output: "ratio",
          },
        ],
        resolution: { triggerVariable: "ratio" },
      };

      assert.throws(() => compileSolver(badManifest), CompilerError);
    });

    it("rejects manifest with unapproved tool hash", () => {
      const fakeHash = "f".repeat(64);
      const badManifest: SolverManifest = {
        version: "1.0.0",
        globals: { collateral: "data.collateral", debt: "data.debt" },
        tree: [
          {
            type: "call",
            id: "bad_hash_call",
            toolHash: fakeHash,
            inputs: { num: "collateral", den: "debt" },
            output: "ratio",
          },
        ],
        resolution: { triggerVariable: "ratio" },
      };

      assert.throws(() => compileSolver(badManifest), /SECURITY BLOCK|not approved/);
    });

    it("rejects manifest with unbounded loop (> 100 iterations)", () => {
      const badManifest: SolverManifest = {
        version: "1.0.0",
        globals: { items: "data.items" },
        tree: [
          {
            type: "loop",
            id: "infinite_loop",
            items: "items",
            itemVar: "item",
            maxIterations: 500,
            body: [],
          },
          {
            type: "expr",
            id: "dummy",
            formula: "true",
            output: "trigger",
          },
        ],
        resolution: { triggerVariable: "trigger" },
      };

      assert.throws(() => compileSolver(badManifest), CompilerError);
    });
  });

  describe("Runtime Execution Engine", () => {
    it("executes direct mathjs expressions and branch control flow", () => {
      const manifest: SolverManifest = {
        version: "1.0.0",
        globals: {
          collateral: "data.account.totalCollateralUSD",
          debt: "data.account.totalDebtUSD",
        },
        tree: [
          {
            type: "expr",
            id: "calc_health",
            formula: "collateral / debt",
            output: "healthRatio",
          },
          {
            type: "branch",
            id: "check_breach",
            condition: "healthRatio <= 1.0",
            then: [
              {
                type: "expr",
                id: "set_breach",
                formula: "true",
                output: "isBreached",
              },
            ],
            else: [
              {
                type: "expr",
                id: "set_safe",
                formula: "false",
                output: "isBreached",
              },
            ],
          },
        ],
        resolution: {
          triggerVariable: "isBreached",
          debounceBlocks: 2,
        },
      };

      const mockUndercollateralized = {
        data: {
          account: {
            totalCollateralUSD: 1000,
            totalDebtUSD: 1500,
          },
        },
      };

      const res = runPipeline(manifest, mockUndercollateralized);
      assert.equal(res.triggered, true);
      assert.equal(res.scope.healthRatio, 1000 / 1500);
      assert.equal(res.scope.isBreached, true);
      assert.ok(res.trace.length >= 2);

      const mockHealthy = {
        data: {
          account: {
            totalCollateralUSD: 3000,
            totalDebtUSD: 1500,
          },
        },
      };

      const healthyRes = runPipeline(manifest, mockHealthy);
      assert.equal(healthyRes.triggered, false);
      assert.equal(healthyRes.scope.healthRatio, 2);
      assert.equal(healthyRes.scope.isBreached, false);
    });

    it("executes pipeline using hashed tools via CallNode alongside ExprNode", () => {
      const manifest: SolverManifest = {
        version: "1.0.0",
        globals: {
          collateral: "data.account.totalCollateralUSD",
          debt: "data.account.totalDebtUSD",
        },
        tree: [
          {
            type: "call",
            id: "calc_ratio",
            toolHash: RATIO_HASH,
            inputs: { num: "collateral", den: "debt" },
            output: "healthRatio",
          },
          {
            type: "call",
            id: "gate_threshold",
            toolHash: THRESHOLD_HASH,
            inputs: { signal: "healthRatio" },
            params: { operator: "<=", target: 1.0 },
            output: "isBreached",
          },
        ],
        resolution: {
          triggerVariable: "isBreached",
          debounceBlocks: 2,
        },
      };

      const mockData = {
        data: {
          account: {
            totalCollateralUSD: "800",
            totalDebtUSD: "1000",
          },
        },
      };

      const res = runPipeline(manifest, mockData);
      assert.equal(res.triggered, true);
      assert.equal(res.scope.healthRatio, 0.8);
      assert.equal(res.scope.isBreached, true);
    });

    it("executes pipeline from compiled Base64 string directly", () => {
      const manifest: SolverManifest = {
        version: "1.0.0",
        globals: { val: "data.val" },
        tree: [
          {
            type: "expr",
            id: "double",
            formula: "val * 2 > 10",
            output: "isOverTen",
          },
        ],
        resolution: { triggerVariable: "isOverTen" },
      };

      const { compiledConfig } = compileSolver(manifest, { compress: true });
      const res = runPipeline(compiledConfig, { data: { val: 6 } });
      assert.equal(res.triggered, true);
      assert.equal(res.scope.isOverTen, true);
    });
  });
});
