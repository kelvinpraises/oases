import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  TensionCastService,
  NOMINAL_SEED_PER_SIDE,
  TOTAL_NOMINAL_PER_VAULT,
} from "../src/services/tension-cast/tension-cast-service";
import { ChainClientService } from "../src/services/chain/client-service";
import {
  getDatabase,
  closeDatabase,
  getActiveJobs,
  type HarbingerDB,
} from "../src/infrastructure/database/index";
import { compileSolver } from "../src/services/oracle/solver-service";
import type { SourceDirective } from "../src/models/Directive";
import type { Kysely } from "kysely";

describe("Tension Cast Apex Domain Service", () => {
  let db: Kysely<HarbingerDB>;
  let chainClient: ChainClientService;
  let validSolverConfig: string;

  beforeEach(() => {
    db = getDatabase(":memory:");
    chainClient = new ChainClientService({
      rpcUrl: "http://127.0.0.1:8545",
      subgraphUrl: "http://127.0.0.1:8000/subgraphs/name/messari/aave-v3",
      chainId: 31337,
      dbPath: ":memory:",
      wsPort: 4001,
      logLevel: "info",
    });

    const manifest = {
      version: "1.0",
      globals: { hf: "data.account.healthFactor" },
      tree: [
        { id: "s1", type: "expr" as const, formula: "hf <= 1.0", output: "breach" },
      ],
      resolution: { triggerVariable: "breach" },
    };
    validSolverConfig = compileSolver(manifest).compiledConfig;
  });

  afterEach(async () => {
    await closeDatabase();
  });

  function createSampleDirective(): SourceDirective {
    return {
      marketId: "0xaave_crv_cascade_directive",
      title: "Aave CRV Contagion Cascade",
      streamId: "stream-aave-001",
      creator: "0xdeployer",
      startBlock: 20000000,
      deadlineBlock: 20005000,
      childVaults: [
        {
          vaultId: "vault-actor-whale",
          marketId: "0xaave_crv_cascade_directive",
          classType: "Actor",
          targetAddress: "0x7a16ff8270133f063aab6c9977183d9e72835428",
          question: "Will Whale 0x7a Health Factor fall <= 1.0?",
          compiledSolverConfig: validSolverConfig,
        },
        {
          vaultId: "vault-place-core-pool",
          marketId: "0xaave_crv_cascade_directive",
          classType: "Place",
          targetAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
          question: "Will Aave Core reserves drop > 40%?",
          compiledSolverConfig: validSolverConfig,
        },
        {
          vaultId: "vault-act-liquidation",
          marketId: "0xaave_crv_cascade_directive",
          classType: "Act",
          targetAddress: "0xliquidationTarget",
          question: "Will CRV liquidation event occur?",
          compiledSolverConfig: validSolverConfig,
        },
        {
          vaultId: "vault-bond-debt-coupling",
          marketId: "0xaave_crv_cascade_directive",
          classType: "Bond",
          targetAddress: "0x7a16ff8270133f063aab6c9977183d9e72835428",
          question: "Will Whale CRV debt coupling break?",
          compiledSolverConfig: validSolverConfig,
        },
      ],
    };
  }

  describe("Directive Manifest Validation", () => {
    it("validates a complete, well-formed Tension Cast directive", () => {
      const service = new TensionCastService(chainClient, db);
      const directive = createSampleDirective();
      assert.doesNotThrow(() => service.validate(directive));
    });

    it("fails fast on empty directive identifiers", () => {
      const service = new TensionCastService(chainClient, db);
      const d1 = { ...createSampleDirective(), marketId: "" };
      assert.throws(() => service.validate(d1), /marketId must not be empty/);

      const d2 = { ...createSampleDirective(), title: "   " };
      assert.throws(() => service.validate(d2), /title must not be empty/);

      const d3 = { ...createSampleDirective(), streamId: "" };
      assert.throws(() => service.validate(d3), /streamId must not be empty/);
    });

    it("rejects invalid block windows", () => {
      const service = new TensionCastService(chainClient, db);
      const d = { ...createSampleDirective(), startBlock: 20005000, deadlineBlock: 20000000 };
      assert.throws(() => service.validate(d), /Invalid directive window/);
    });

    it("rejects directives with empty child vaults array", () => {
      const service = new TensionCastService(chainClient, db);
      const d = { ...createSampleDirective(), childVaults: [] };
      assert.throws(() => service.validate(d), /contain at least 1 child vault/);
    });

    it("rejects child vaults with invalid physical classes", () => {
      const service = new TensionCastService(chainClient, db);
      const directive = createSampleDirective();
      // @ts-expect-error testing invalid physical class
      directive.childVaults[0].classType = "Predator";
      assert.throws(() => service.validate(directive), /Invalid PhysicalClass: "Predator"/);
    });

    it("rejects child vaults with corrupted solver configurations", () => {
      const service = new TensionCastService(chainClient, db);
      const directive = createSampleDirective();
      directive.childVaults[0].compiledSolverConfig = "corrupted-non-json-base64";
      assert.throws(() => service.validate(directive), /has invalid solverConfig/);
    });
  });

  describe("4-Class Contagion Clustering", () => {
    it("partitions open set of N child vaults into 4 immutable physical classes", () => {
      const service = new TensionCastService(chainClient, db);
      const directive = createSampleDirective();
      const cluster = service.buildContagionCluster(directive);

      assert.equal(cluster.directiveId, directive.marketId);
      assert.equal(cluster.totalVaultCount, 4);
      assert.equal(cluster.actors.length, 1);
      assert.equal(cluster.places.length, 1);
      assert.equal(cluster.acts.length, 1);
      assert.equal(cluster.bonds.length, 1);

      assert.equal(cluster.actors[0].vaultId, "vault-actor-whale");
      assert.equal(cluster.places[0].vaultId, "vault-place-core-pool");
      assert.equal(cluster.acts[0].vaultId, "vault-act-liquidation");
      assert.equal(cluster.bonds[0].vaultId, "vault-bond-debt-coupling");
    });
  });

  describe("Genesis Priming & Host SQLite Job Enrollment", () => {
    it("primes open set of N child vaults with $20 nominal each and enrolls into SQLite", async () => {
      const service = new TensionCastService(chainClient, db);
      const directive = createSampleDirective();

      const result = await service.primeTensionCast(directive);

      assert.equal(result.marketId, directive.marketId);
      assert.equal(result.primedVaults.length, 4);

      // Verify exact $20 nominal seed per vault ($10 YES / $10 NO = 20 WAD)
      for (const primed of result.primedVaults) {
        assert.equal(primed.nominalSeedYes, NOMINAL_SEED_PER_SIDE);
        assert.equal(primed.nominalSeedNo, NOMINAL_SEED_PER_SIDE);
        assert.equal(primed.totalPrimedPot, TOTAL_NOMINAL_PER_VAULT);
      }

      // Verify total nominal seed capital across N=4 child vaults: 4 * 20 WAD = 80 WAD
      const expectedTotalWad = 4n * TOTAL_NOMINAL_PER_VAULT;
      assert.equal(result.totalSeedCapital, expectedTotalWad);

      // Verify that every primed child vault is enrolled into host SQLite active_jobs
      const activeJobs = await getActiveJobs(db);
      assert.equal(activeJobs.length, 4);
      for (const job of activeJobs) {
        assert.equal(job.status, "idle");
        assert.equal(job.cadenceMs, 10_000);
        assert.equal(job.consecutiveBreaches, 0);
      }
    });

    it("tiered idempotency: re-running priming on already-enrolled vaults reuses records", async () => {
      const service = new TensionCastService(chainClient, db);
      const directive = createSampleDirective();

      // First run
      const res1 = await service.primeTensionCast(directive);
      assert.equal(res1.primedVaults.length, 4);

      // Second run (idempotent replay)
      const res2 = await service.primeTensionCast(directive);
      assert.equal(res2.primedVaults.length, 4);

      // Verify SQLite job count remains exactly 4 (no duplicate rows)
      const activeJobs = await getActiveJobs(db);
      assert.equal(activeJobs.length, 4);
    });
  });

  describe("Tension Cast Status & Expiry", () => {
    it("reports remaining blocks and active state correctly", () => {
      const service = new TensionCastService(chainClient, db);
      const directive = createSampleDirective();

      const statusActive = service.getStatus(directive, 20002000);
      assert.equal(statusActive.isExpired, false);
      assert.equal(statusActive.remainingBlocks, 3000);
      assert.equal(statusActive.cluster.totalVaultCount, 4);

      const statusExpired = service.getStatus(directive, 20005001);
      assert.equal(statusExpired.isExpired, true);
      assert.equal(statusExpired.remainingBlocks, 0);
    });
  });
});
