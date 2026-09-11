import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { PublicClient, WalletClient, Account, Address, Hash } from "viem";
import { ChainClientService } from "@/services/chain/client-service";
import {
  InsufficientGasBalanceError,
  SettlementVerificationError,
  OUTCOME_ENUM_MAP,
} from "@/services/chain/types";
import {
  buildReplayTicket,
  evaluatePrecedence,
  type SolverManifest,
  type ReplayTicket,
} from "@/services/oracle";
import { JournalService } from "@/services/journal/journal-service";
import { getDatabase, closeDatabase } from "@/infrastructure/database/connection";
import type { HarbingerConfig } from "@/config";

describe("On-Chain Settlement Bridge (Vault.resolve & Serialized Nonce Queue)", () => {
  const startBlock = 20000000;
  const deadlineBlock = 20000300;
  const testVaultAddress = "0x1234567890123456789012345678901234567890" as Address;
  const testVaultId = "vault-settle-alpha";

  let journalService: JournalService;
  let testConfig: HarbingerConfig;
  let validTicket: ReplayTicket;

  beforeEach(() => {
    const db = getDatabase(":memory:");
    journalService = new JournalService(db);

    testConfig = {
      rpcUrl: "http://127.0.0.1:8545",
      subgraphUrl: "http://127.0.0.1:8000/subgraphs/name/oases",
      chainId: 31337,
      dbPath: ":memory:",
      wsPort: 4001,
      logLevel: "info",
      operatorPrivateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    };

    const manifest: SolverManifest = {
      version: "1.0.0",
      query: "query CheckMetric { pool { reserve } }",
      timeBounds: { startBlock, deadlineBlock },
      globals: {
        reserve: "data.pool.reserve",
      },
      tree: [
        {
          type: "expr",
          id: "breachCheck",
          formula: "reserve < 100",
          output: "isBreached",
        },
      ],
      resolution: {
        triggerVariable: "isBreached",
        debounceBlocks: 2,
      },
    };

    const validProof = evaluatePrecedence({
      breachBlock: 20000150,
      startBlock,
      deadlineBlock,
      abortTimestamp: null,
      consecutiveBreachBlocks: 2,
      requiredDebounce: 2,
    });

    const blockSnapshots = [
      {
        blockNumber: 20000150,
        inputs: { reserve: 95 },
        intermediate: {},
        trigger: true,
      },
      {
        blockNumber: 20000151,
        inputs: { reserve: 90 },
        intermediate: {},
        trigger: true,
      },
    ];

    validTicket = buildReplayTicket({
      vaultId: testVaultId,
      manifest,
      precedenceProof: validProof,
      blockSnapshots,
      timestamp: 1726000000,
    });
  });

  afterEach(async () => {
    await closeDatabase();
  });

  function createMockBridge(options?: {
    walletBalanceWei?: bigint;
    vaultStatus?: number; // 0=Open, 3=Resolved
    writeDelayMs?: number;
    onWriteContract?: (args: Record<string, unknown>) => void;
  }) {
    const writeCalls: Array<Record<string, unknown>> = [];
    const balance = options?.walletBalanceWei ?? 10_000_000_000_000_000n; // 0.01 ETH
    const status = options?.vaultStatus ?? 0; // default Open

    const mockPublicClient = {
      getBalance: async () => balance,
      readContract: async () => [
        "0x0000000000000000000000000000000000000000000000000000000000000001" as `0x${string}`,
        "0x0000000000000000000000000000000000000000000000000000000000000002" as `0x${string}`,
        "Question",
        "Config",
        "0x1111111111111111111111111111111111111111" as Address,
        status, // status
        0, // outcome
        0, // resolvedAt
        true, // exists
      ],
      estimateFeesPerGas: async () => ({
        maxFeePerGas: 20_000_000_000n,
        maxPriorityFeePerGas: 1_000_000_000n,
      }),
      waitForTransactionReceipt: async ({ hash }: { hash: Hash }) => ({
        blockNumber: 20000155n,
        gasUsed: 85000n,
        status: "success",
        transactionHash: hash,
      }),
      getBlockNumber: async () => 20000155n,
    } as unknown as PublicClient;

    const mockAccount = {
      address: "0x1111111111111111111111111111111111111111" as Address,
      type: "local",
    } as unknown as Account;

    const mockWalletClient = {
      writeContract: async (params: Record<string, unknown>) => {
        writeCalls.push(params);
        if (options?.onWriteContract) {
          options.onWriteContract(params);
        }
        if (options?.writeDelayMs) {
          await new Promise((resolve) => setTimeout(resolve, options.writeDelayMs));
        }
        return `0xhash-${writeCalls.length}-${Date.now()}` as Hash;
      },
    } as unknown as WalletClient;

    const service = new ChainClientService(testConfig, journalService, {
      publicClient: mockPublicClient,
      walletClient: mockWalletClient,
      account: mockAccount,
    });

    return { service, writeCalls };
  }

  it("settles Outcome.Yes on-chain when verified by ReplayTicket and records forensic journal entry", async () => {
    const { service, writeCalls } = createMockBridge();

    const result = await service.resolveVault(
      testVaultAddress,
      testVaultId,
      "Yes",
      validTicket
    );

    assert.equal(result.vaultId, testVaultId);
    assert.equal(result.outcome, "Yes");
    assert.ok(result.txHash.startsWith("0xhash-"));
    assert.equal(result.blockNumber, 20000155);
    assert.equal(result.gasUsed, 85000n);
    assert.ok(result.replayTicketHash);

    // Verify on-chain writeContract parameters
    assert.equal(writeCalls.length, 1);
    assert.equal(writeCalls[0].address, testVaultAddress);
    assert.equal(writeCalls[0].functionName, "resolve");
    assert.equal((writeCalls[0].args as [unknown, number])[1], OUTCOME_ENUM_MAP.Yes); // 1
    assert.equal(writeCalls[0].maxFeePerGas, 25_000_000_000n); // 20 Gwei * 1.25

    // Verify forensic journal entry
    const thoughts = await journalService.getRecentThoughts(5);
    assert.ok(thoughts.length >= 1);
    const settleThought = thoughts[0];
    assert.equal(settleThought.level, "RESOLUTION");
    assert.equal(settleThought.type, "RESOLUTION_VERDICT");
    assert.ok(settleThought.thought.includes("Outcome.Yes"));
    assert.equal(settleThought.confidenceScore, 1.0);
    assert.equal(settleThought.metadata?.vaultId, testVaultId);
  });

  it("settles Outcome.No on deadline expiration without requiring a ReplayTicket", async () => {
    const { service, writeCalls } = createMockBridge();

    const result = await service.resolveVault(
      testVaultAddress,
      testVaultId,
      "No"
    );

    assert.equal(result.outcome, "No");
    assert.equal(result.blockNumber, 20000155);
    assert.equal(result.gasUsed, 85000n);

    // Verify on-chain writeContract parameters
    assert.equal(writeCalls.length, 1);
    assert.equal((writeCalls[0].args as [unknown, number])[1], OUTCOME_ENUM_MAP.No); // 2

    // Verify forensic journal entry
    const thoughts = await journalService.getRecentThoughts(5);
    assert.equal(thoughts[0].level, "RESOLUTION");
    assert.ok(thoughts[0].thought.includes("Outcome.No"));
  });

  it("enforces Axiom 5.1 (Proof-Gated Settlement): halts on missing or invalid ReplayTicket with 0 gas spent", async () => {
    const { service, writeCalls } = createMockBridge();

    // 1. Missing ticket for Yes outcome
    await assert.rejects(
      () => service.resolveVault(testVaultAddress, testVaultId, "Yes"),
      (err: Error) => {
        assert.ok(err instanceof SettlementVerificationError);
        assert.ok(err.message.includes("Missing ReplayTicket"));
        return true;
      }
    );
    assert.equal(writeCalls.length, 0);

    // 2. Tampered ticket (non-consecutive blocks)
    const tamperedTicket: ReplayTicket = {
      ...validTicket,
      blockSnapshots: [
        { blockNumber: 20000150, inputs: { reserve: 95 }, intermediate: {}, trigger: true },
        { blockNumber: 20000155, inputs: { reserve: 90 }, intermediate: {}, trigger: true }, // Gap of 5 blocks!
      ],
    };

    await assert.rejects(
      () => service.resolveVault(testVaultAddress, testVaultId, "Yes", tamperedTicket),
      (err: Error) => {
        assert.ok(err instanceof SettlementVerificationError);
        assert.ok(err.message.includes("Non-consecutive block sequence"));
        return true;
      }
    );
    assert.equal(writeCalls.length, 0); // Zero on-chain transactions dispatched
  });

  it("enforces Axiom 5.2 (Idempotent Resolution): skips broadcast when vault is already resolved", async () => {
    const { service, writeCalls } = createMockBridge({
      vaultStatus: 3, // Status.Resolved
    });

    const result = await service.resolveVault(
      testVaultAddress,
      testVaultId,
      "Yes",
      validTicket
    );

    // Zero transactions dispatched
    assert.equal(writeCalls.length, 0);

    // Returns zeroed receipt cleanly
    assert.equal(
      result.txHash,
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
    assert.equal(result.gasUsed, 0n);
    assert.equal(result.outcome, "Yes");
  });

  it("enforces Axiom 5.3 (Serialized Nonce Queue): executes concurrent resolutions strictly in sequence", async () => {
    let activeExecutions = 0;
    let maxConcurrentExecutions = 0;

    const { service, writeCalls } = createMockBridge({
      writeDelayMs: 25,
      onWriteContract: () => {
        activeExecutions++;
        if (activeExecutions > maxConcurrentExecutions) {
          maxConcurrentExecutions = activeExecutions;
        }
        setTimeout(() => {
          activeExecutions--;
        }, 20);
      },
    });

    // Dispatch 4 simultaneous resolution calls for 4 different child vaults
    const promises = [
      service.resolveVault(testVaultAddress, "vault-1", "No"),
      service.resolveVault(testVaultAddress, "vault-2", "No"),
      service.resolveVault(testVaultAddress, "vault-3", "No"),
      service.resolveVault(testVaultAddress, "vault-4", "No"),
    ];

    const results = await Promise.all(promises);

    assert.equal(results.length, 4);
    assert.equal(writeCalls.length, 4);
    // Serialized execution guarantees that at no point were two transactions in flight simultaneously
    assert.equal(maxConcurrentExecutions, 1);
  });

  it("enforces gas balance guard: throws InsufficientGasBalanceError when operator balance < 0.005 ETH", async () => {
    const { service, writeCalls } = createMockBridge({
      walletBalanceWei: 2_000_000_000_000_000n, // 0.002 ETH < 0.005 ETH minimum
    });

    await assert.rejects(
      () => service.resolveVault(testVaultAddress, testVaultId, "No"),
      (err: Error) => {
        assert.ok(err instanceof InsufficientGasBalanceError);
        assert.ok(err.message.includes("Insufficient operator gas balance"));
        assert.equal(err.currentBalance, 2_000_000_000_000_000n);
        assert.equal(err.requiredBalance, 5_000_000_000_000_000n);
        return true;
      }
    );

    assert.equal(writeCalls.length, 0); // No transaction dispatched
  });
});
