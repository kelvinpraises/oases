import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PHYSICAL_CLASSES,
  isPhysicalClass,
  assertPhysicalClass,
  type ChildVault,
  type SourceDirective,
  type Job,
  type JournalEntry,
} from "../src/models/index";

describe("Domain Models & 4-Class Physical Taxonomy", () => {
  it("recognizes all 4 immutable physical reality classes", () => {
    assert.deepEqual(PHYSICAL_CLASSES, ["Actor", "Place", "Act", "Bond"]);
    assert.equal(isPhysicalClass("Actor"), true);
    assert.equal(isPhysicalClass("Place"), true);
    assert.equal(isPhysicalClass("Act"), true);
    assert.equal(isPhysicalClass("Bond"), true);
  });

  it("strictly rejects fantasy subclasses and invalid types", () => {
    assert.equal(isPhysicalClass("Liquidator"), false);
    assert.equal(isPhysicalClass("Whale"), false);
    assert.equal(isPhysicalClass("DEX"), false);
    assert.equal(isPhysicalClass("Predator"), false);
    assert.equal(isPhysicalClass("Grazer"), false);
    assert.equal(isPhysicalClass(null), false);
    assert.equal(isPhysicalClass(123), false);
    assert.equal(isPhysicalClass({}), false);
  });

  it("assertPhysicalClass passes valid classes and throws descriptive error on invalid", () => {
    assert.doesNotThrow(() => assertPhysicalClass("Actor"));
    assert.doesNotThrow(() => assertPhysicalClass("Place"));
    assert.doesNotThrow(() => assertPhysicalClass("Act"));
    assert.doesNotThrow(() => assertPhysicalClass("Bond"));

    assert.throws(
      () => assertPhysicalClass("FantasyClass"),
      /Invalid PhysicalClass: "FantasyClass"\. Must strictly be one of: Actor, Place, Act, Bond/
    );
  });

  it("constructs a ChildVault entity conforming to physical taxonomy", () => {
    const vault: ChildVault = {
      vaultId: "0xvault1",
      marketId: "0xmarket1",
      classType: "Actor",
      targetAddress: "0x7a16ff8270133f063aab6c9977183d9e72835428",
      question: "Will Whale 0x7a Health Factor fall <= 1.0?",
      compiledSolverConfig: "eyJ2ZXJzaW9uIjoiMS4wIn0=",
    };

    assert.equal(vault.classType, "Actor");
    assert.equal(vault.vaultId, "0xvault1");
  });

  it("constructs a SourceDirective entity with child vaults", () => {
    const directive: SourceDirective = {
      marketId: "0xmarketAaveCascade",
      title: "Aave CRV Cascade Directive",
      streamId: "stream-001",
      creator: "0xdeployer",
      startBlock: 20000000,
      deadlineBlock: 20005000,
      childVaults: [
        {
          vaultId: "0xvaultWhale",
          marketId: "0xmarketAaveCascade",
          classType: "Actor",
          targetAddress: "0x7a16ff8270133f063aab6c9977183d9e72835428",
          question: "Will Whale 0x7a HF fall <= 1.0?",
          compiledSolverConfig: "config-a",
        },
        {
          vaultId: "0xvaultPool",
          marketId: "0xmarketAaveCascade",
          classType: "Place",
          targetAddress: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
          question: "Will Aave Core Pool reserves drop > 40%?",
          compiledSolverConfig: "config-b",
        },
      ],
    };

    assert.equal(directive.childVaults.length, 2);
    assert.equal(directive.childVaults[0].classType, "Actor");
    assert.equal(directive.childVaults[1].classType, "Place");
  });

  it("constructs Job and JournalEntry entities", () => {
    const job: Job = {
      id: "job-1",
      vaultId: "0xvault1",
      cadenceMs: 5000,
      status: "idle",
      consecutiveBreaches: 0,
      createdAt: 1000,
      updatedAt: 1000,
    };
    assert.equal(job.status, "idle");

    const entry: JournalEntry = {
      id: "jrn-1",
      timestamp: 1000,
      level: "INFO",
      type: "SYSTEM_LIFECYCLE",
      source: "daemon",
      thought: "Bootstrapping daemon substrate",
      confidenceScore: 0.95,
      metadata: { key: "value" },
    };
    assert.equal(entry.level, "INFO");
    assert.equal(entry.confidenceScore, 0.95);
  });
});
