import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  encodeAbiParameters,
  encodeEventTopics
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  marketDriverAbi,
  vaultDriverAbi
} from "@oases/contracts";
import {
  createOptionsReader,
  createOptionsWriter,
  ConvictionSide
} from "../src/index.js";

const TEST_ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
);

const MOCK_ADDRESSES = {
  marketRegistry: "0x1111111111111111111111111111111111111111" as Address,
  vault: "0x2222222222222222222222222222222222222222" as Address,
  marketDriver: "0x3333333333333333333333333333333333333333" as Address,
  mockUsdc: "0x4444444444444444444444444444444444444444" as Address,
  agentRegistry: "0x5555555555555555555555555555555555555555" as Address,
  vaultDriver: "0x6666666666666666666666666666666666666666" as Address
};

const SAMPLE_MARKET_ID = ("0x" + "aa".repeat(32)) as Hex;
const SAMPLE_VAULT_ID = ("0x" + "bb".repeat(32)) as Hex;

describe("OptionsReader", () => {
  it("uses provided addresses or defaults to localhost deployment", () => {
    const mockPublic = {} as PublicClient;
    const readerCustom = createOptionsReader({
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });
    assert.equal(readerCustom.addresses.vault, MOCK_ADDRESSES.vault);

    const readerDefault = createOptionsReader({ publicClient: mockPublic });
    assert.ok(readerDefault.addresses.vault);
    assert.match(readerDefault.addresses.vault, /^0x[0-9a-fA-F]{40}$/);
  });

  it("reads market details and handles nonexistent markets gracefully", async () => {
    const mockPublic = {
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "marketExists") return true;
        if (functionName === "getMarket") {
          return {
            id: SAMPLE_MARKET_ID,
            title: "Aave CRV Cascade",
            streamId: ("0x" + "11".repeat(32)) as Hex,
            creator: TEST_ACCOUNT.address,
            createdAt: 1700000000n,
            exists: true
          };
        }
        throw new Error(`Unexpected function ${functionName}`);
      }
    } as unknown as PublicClient;

    const reader = createOptionsReader({
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const market = await reader.readMarket(SAMPLE_MARKET_ID);
    assert.equal(market.id, SAMPLE_MARKET_ID);
    assert.equal(market.name, "Aave CRV Cascade");
    assert.equal(market.createdAt, 1700000000);
    assert.equal(market.exists, true);

    // Test non-existent market
    const mockPublicNonExistent = {
      readContract: async () => false
    } as unknown as PublicClient;

    const reader2 = createOptionsReader({
      publicClient: mockPublicNonExistent,
      addresses: MOCK_ADDRESSES
    });
    const emptyMarket = await reader2.readMarket(SAMPLE_MARKET_ID);
    assert.equal(emptyMarket.exists, false);
    assert.equal(emptyMarket.name, "");
  });

  it("reads vault pools, solverConfig, boards, and position structures", async () => {
    const mockPublic = {
      readContract: async ({ functionName, args: _args }: { functionName: string; args?: unknown[] }) => {
        if (functionName === "vaults") {
          return [
            SAMPLE_VAULT_ID,
            SAMPLE_MARKET_ID,
            "Will CRV drop below 0.20?",
            "Base64SolverConfig",
            TEST_ACCOUNT.address,
            0, // Status.Open
            0, // Outcome.Pending
            0, // resolvedAt
            true // exists
          ];
        }
        if (functionName === "getVaultPools") {
          return [10_000_000n, 10_000_000n, 50_000_000_000_000_000_000n, 50_000_000_000_000_000_000n];
        }
        if (functionName === "solverConfig") return "Base64SolverConfig";
        if (functionName === "getBoard") {
          return {
            pool: 10_000_000n,
            sideRate: 100_000n,
            g: 500_000_000_000_000n,
            lastAdvance: 1700000000,
            sideShares: 50_000_000_000_000_000_000n
          };
        }
        if (functionName === "getPositionStruct") {
          return {
            rate: 50_000n,
            gPaid: 100_000_000_000_000n,
            sharesAccrued: 25_000_000_000_000_000_000n,
            maxEnd: 1700010000,
            depleted: false,
            fundStart: 1700000000,
            lostUsdc: 0n
          };
        }
        if (functionName === "pendingShares") return 30_000_000_000_000_000_000n;
        if (functionName === "getSharePrice") return 110_000n;
        throw new Error(`Unexpected function ${functionName}`);
      }
    } as unknown as PublicClient;

    const reader = createOptionsReader({
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const vault = await reader.readVault(SAMPLE_VAULT_ID);
    assert.equal(vault.question, "Will CRV drop below 0.20?");
    assert.equal(vault.solverConfig, "Base64SolverConfig");
    assert.equal(vault.yesPool, 10_000_000n);
    assert.equal(vault.status, 0);

    const board = await reader.readBoard(SAMPLE_VAULT_ID, ConvictionSide.YES);
    assert.equal(board.pool, 10_000_000n);
    assert.equal(board.sideRate, 100_000n);
    assert.equal(board.lastAdvance, 1700000000);

    const pos = await reader.readPosition(SAMPLE_VAULT_ID, ConvictionSide.YES, 1n);
    assert.equal(pos.rate, 50_000n);
    assert.equal(pos.pendingShares, 30_000_000_000_000_000_000n);
    assert.equal(pos.depleted, false);

    const price = await reader.readSharePrice(SAMPLE_VAULT_ID, ConvictionSide.YES);
    assert.equal(price, 110_000n);
  });

  it("computes claimable payouts when vault is resolved", async () => {
    const mockPublic = {
      readContract: async ({ functionName }: { functionName: string }) => {
        if (functionName === "vaults") {
          return [
            SAMPLE_VAULT_ID,
            SAMPLE_MARKET_ID,
            "Question",
            "Config",
            TEST_ACCOUNT.address,
            3, // Status.Resolved
            1, // Outcome.Yes
            1700000000,
            true
          ];
        }
        if (functionName === "claimed") return false;
        if (functionName === "getPositionStruct") {
          return {
            rate: 0n,
            gPaid: 0n,
            sharesAccrued: 25_000_000_000_000_000_000n, // 25 shares (half the winning shares)
            maxEnd: 0,
            depleted: true,
            fundStart: 0,
            lostUsdc: 0n
          };
        }
        if (functionName === "getBoard") {
          return {
            pool: 50_000_000n,
            sideRate: 0n,
            g: 0n,
            lastAdvance: 1700000000,
            sideShares: 50_000_000_000_000_000_000n // 50 shares total
          };
        }
        if (functionName === "pot") return 100_000_000n; // 100 USDC total pot
        if (functionName === "collected") return true;
        if (functionName === "overageOwed") return 5_000_000n; // 5 USDC overage
        throw new Error(`Unexpected function ${functionName}`);
      }
    } as unknown as PublicClient;

    const reader = createOptionsReader({
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const claim = await reader.readClaimable(SAMPLE_VAULT_ID, 1n);
    assert.equal(claim.isResolved, true);
    assert.equal(claim.winningSide, ConvictionSide.YES);
    // Expected: 25/50 of 100 USDC = 50 USDC (50_000_000n) + 5 USDC overage = 55_000_000n
    assert.equal(claim.claimable, 55_000_000n);
  });

  it("reads token lists, NFT lanes, USDC balance and allowance", async () => {
    const mockPublic = {
      readContract: async ({ functionName, args: _args }: { functionName: string; args?: unknown[] }) => {
        if (functionName === "tokensOfOwner") return [101n, 102n];
        if (functionName === "laneCount") return 1n;
        if (functionName === "laneAt") {
          return [SAMPLE_VAULT_ID, 0, 10_000n];
        }
        if (functionName === "balanceOf") return 1_000_000_000n;
        if (functionName === "allowance") return 500_000_000n;
        throw new Error(`Unexpected function ${functionName}`);
      }
    } as unknown as PublicClient;

    const reader = createOptionsReader({
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const tokens = await reader.listOwnerTokens(TEST_ACCOUNT.address);
    assert.deepEqual(tokens, [101n, 102n]);

    const lanes = await reader.readNftLanes(101n);
    assert.equal(lanes.length, 1);
    assert.equal(lanes[0].vaultId, SAMPLE_VAULT_ID);
    assert.equal(lanes[0].side, ConvictionSide.YES);
    assert.equal(lanes[0].rate, 10_000n);

    const balance = await reader.readUsdcBalance(TEST_ACCOUNT.address);
    assert.equal(balance, 1_000_000_000n);

    const allowance = await reader.readUsdcAllowance(TEST_ACCOUNT.address, MOCK_ADDRESSES.marketDriver);
    assert.equal(allowance, 500_000_000n);
  });

  it("reads agent authorization and metadata", async () => {
    const mockPublic = {
      readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
        if (functionName === "isAuthorizedAgent") {
          return args[0] === TEST_ACCOUNT.address;
        }
        if (functionName === "agentMetadata") {
          return '{"name":"Sentinel Agent"}';
        }
        throw new Error(`Unexpected function ${functionName}`);
      }
    } as unknown as PublicClient;

    const reader = createOptionsReader({
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const isAuth = await reader.readAgentAuthorization(TEST_ACCOUNT.address);
    assert.equal(isAuth, true);

    const isOtherAuth = await reader.readAgentAuthorization("0x9999999999999999999999999999999999999999" as Address);
    assert.equal(isOtherAuth, false);

    const meta = await reader.readAgentMetadata(TEST_ACCOUNT.address);
    assert.equal(meta, '{"name":"Sentinel Agent"}');
  });

  it("returns false silently when agentRegistry address is missing or zero address", async () => {
    const mockPublic = {} as PublicClient;
    const readerUndefined = createOptionsReader({
      publicClient: mockPublic,
      addresses: {
        marketRegistry: MOCK_ADDRESSES.marketRegistry,
        vault: MOCK_ADDRESSES.vault,
        marketDriver: MOCK_ADDRESSES.marketDriver,
        mockUsdc: MOCK_ADDRESSES.mockUsdc,
        agentRegistry: undefined
      }
    });

    const isAuthUndefined = await readerUndefined.readAgentAuthorization(TEST_ACCOUNT.address);
    assert.equal(isAuthUndefined, false);

    const readerZero = createOptionsReader({
      publicClient: mockPublic,
      addresses: {
        marketRegistry: MOCK_ADDRESSES.marketRegistry,
        vault: MOCK_ADDRESSES.vault,
        marketDriver: MOCK_ADDRESSES.marketDriver,
        mockUsdc: MOCK_ADDRESSES.mockUsdc,
        agentRegistry: "0x0000000000000000000000000000000000000000" as Address
      }
    });

    const isAuthZero = await readerZero.readAgentAuthorization(TEST_ACCOUNT.address);
    assert.equal(isAuthZero, false);

    // Metadata reading still requires agentRegistry to be configured
    await assert.rejects(
      () => readerUndefined.readAgentMetadata(TEST_ACCOUNT.address),
      /agentRegistry address is not configured/
    );
  });
});

describe("OptionsWriter", () => {
  it("throws if WalletClient lacks an account", () => {
    const mockWallet = {} as WalletClient;
    const mockPublic = {} as PublicClient;

    const writer = createOptionsWriter({
      walletClient: mockWallet,
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    assert.rejects(
      () => writer.mintFunderNft({ marketId: SAMPLE_MARKET_ID, to: TEST_ACCOUNT.address }),
      /WalletClient must have an account configured/
    );
  });

  it("mints funder NFT and decodes MarketNftMinted event from receipt", async () => {
    const txHash = ("0x" + "99".repeat(32)) as Hex;
    const expectedTokenId = 42n;

    // Encode simulated MarketNftMinted event log
    const topics = encodeEventTopics({
      abi: marketDriverAbi,
      eventName: "MarketNftMinted",
      args: {
        tokenId: expectedTokenId,
        marketId: SAMPLE_MARKET_ID,
        to: TEST_ACCOUNT.address
      }
    });

    const mockPublic = {
      waitForTransactionReceipt: async () => ({
        status: "success",
        logs: [
          {
            address: MOCK_ADDRESSES.marketDriver,
            topics,
            data: "0x"
          }
        ]
      })
    } as unknown as PublicClient;

    let writeContractCalled = false;
    const mockWallet = {
      account: TEST_ACCOUNT,
      chain: undefined,
      writeContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
        writeContractCalled = true;
        assert.equal(functionName, "mint");
        assert.equal(args[0], SAMPLE_MARKET_ID);
        assert.equal(args[1], TEST_ACCOUNT.address);
        return txHash;
      }
    } as unknown as WalletClient;

    const writer = createOptionsWriter({
      walletClient: mockWallet,
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const result = await writer.mintFunderNft({
      marketId: SAMPLE_MARKET_ID,
      to: TEST_ACCOUNT.address
    });

    assert.ok(writeContractCalled);
    assert.equal(result.txHash, txHash);
    assert.equal(result.tokenId, expectedTokenId);
  });

  it("auto-approves USDC before fundStream when allowance is insufficient", async () => {
    let allowance = 5_000_000n; // 5 USDC (insufficient for 20 USDC deposit)
    const deposit = 20_000_000n; // 20 USDC
    const calls: string[] = [];

    const mockPublic = {
      readContract: async () => allowance,
      waitForTransactionReceipt: async () => ({ status: "success" })
    } as unknown as PublicClient;

    const mockWallet = {
      account: TEST_ACCOUNT,
      chain: undefined,
      writeContract: async ({ functionName }: { functionName: string }) => {
        calls.push(functionName);
        if (functionName === "approve") {
          allowance = 1_000_000_000_000n;
        }
        return ("0x" + "11".repeat(32)) as Hex;
      }
    } as unknown as WalletClient;

    const writer = createOptionsWriter({
      walletClient: mockWallet,
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const hash = await writer.fundStream({
      tokenId: 1n,
      vaultId: SAMPLE_VAULT_ID,
      side: ConvictionSide.YES,
      rate: 10_000n,
      deposit
    });

    assert.ok(hash);
    assert.deepEqual(calls, ["approve", "fund"]);
  });

  it("skips approval in fundStream when allowance is already sufficient", async () => {
    const allowance = 100_000_000n; // 100 USDC (sufficient)
    const deposit = 20_000_000n;
    const calls: string[] = [];

    const mockPublic = {
      readContract: async () => allowance,
      waitForTransactionReceipt: async () => ({ status: "success" })
    } as unknown as PublicClient;

    const mockWallet = {
      account: TEST_ACCOUNT,
      chain: undefined,
      writeContract: async ({ functionName }: { functionName: string }) => {
        calls.push(functionName);
        return ("0x" + "22".repeat(32)) as Hex;
      }
    } as unknown as WalletClient;

    const writer = createOptionsWriter({
      walletClient: mockWallet,
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    await writer.fundStream({
      tokenId: 1n,
      vaultId: SAMPLE_VAULT_ID,
      side: ConvictionSide.NO,
      rate: 10_000n,
      deposit
    });

    assert.deepEqual(calls, ["fund"]);
  });

  it("dispatches setLanes, stopFunding, stopAllFunding, and withdraw operations", async () => {
    const executed: Array<{ fn: string; args: unknown[] }> = [];

    const mockPublic = {
      readContract: async () => 1_000_000_000n, // Plenty of allowance
      waitForTransactionReceipt: async () => ({ status: "success" })
    } as unknown as PublicClient;

    const mockWallet = {
      account: TEST_ACCOUNT,
      chain: undefined,
      writeContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
        executed.push({ fn: functionName, args });
        return ("0x" + "33".repeat(32)) as Hex;
      }
    } as unknown as WalletClient;

    const writer = createOptionsWriter({
      walletClient: mockWallet,
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    // 1. setLanes
    await writer.setLanes({
      tokenId: 5n,
      lanes: [{ vaultId: SAMPLE_VAULT_ID, side: ConvictionSide.YES, rate: 50_000n }],
      addDeposit: 10_000_000n
    });

    // 2. stopFunding
    await writer.stopFunding({
      tokenId: 5n,
      vaultId: SAMPLE_VAULT_ID,
      side: ConvictionSide.YES
    });

    // 3. stopAllFunding
    await writer.stopAllFunding({ tokenId: 5n });

    // 4. withdraw
    await writer.withdraw({ tokenId: 5n, vaultId: SAMPLE_VAULT_ID });

    // 5. withdrawBatch
    await writer.withdrawBatch({ tokenId: 5n, vaultIds: [SAMPLE_VAULT_ID] });

    // 6. advance
    await writer.advance({ vaultId: SAMPLE_VAULT_ID, side: ConvictionSide.YES, maxSteps: 32n });

    // 7. approveUsdc
    await writer.approveUsdc({ spender: MOCK_ADDRESSES.marketDriver, amount: 50_000_000n });

    assert.equal(executed.length, 7);
    assert.equal(executed[0].fn, "setLanes");
    assert.equal(executed[1].fn, "stop");
    assert.equal(executed[2].fn, "stopAll");
    assert.equal(executed[3].fn, "withdraw");
    assert.equal(executed[4].fn, "withdraw");
    assert.equal(executed[5].fn, "advance");
    assert.equal(executed[6].fn, "approve");
  });

  it("creates vault and decodes SeedOpened event from receipt", async () => {
    const txHash = ("0x" + "88".repeat(32)) as Hex;
    const expectedVaultId = ("0x" + "77".repeat(32)) as Hex;

    const topics = encodeEventTopics({
      abi: vaultDriverAbi,
      eventName: "SeedOpened",
      args: {
        vaultId: expectedVaultId,
        creator: TEST_ACCOUNT.address
      }
    });

    const data = encodeAbiParameters(
      [
        { type: "uint8", name: "side" },
        { type: "uint256", name: "rate" },
        { type: "uint256", name: "deposit" },
        { type: "uint32", name: "maxEnd" }
      ],
      [0, 1_000_000n, 50_000_000n, 1000]
    );

    const allowance = 50_000_000n;
    const calls: Array<{ fn: string; args?: unknown[] }> = [];

    const mockPublic = {
      readContract: async () => allowance,
      waitForTransactionReceipt: async () => ({
        status: "success",
        logs: [
          {
            address: MOCK_ADDRESSES.vaultDriver,
            topics,
            data
          }
        ]
      })
    } as unknown as PublicClient;

    const mockWallet = {
      account: TEST_ACCOUNT,
      chain: undefined,
      writeContract: async ({ functionName, args }: { functionName: string; args?: unknown[] }) => {
        calls.push({ fn: functionName, args });
        return txHash;
      }
    } as unknown as WalletClient;

    const writer = createOptionsWriter({
      walletClient: mockWallet,
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const result = await writer.createVault({
      marketId: SAMPLE_MARKET_ID,
      question: "Will ETH break 10k?",
      solverConfig: "eyJzb2x2ZXIiOiJ0ZXN0In0=",
      seedSide: ConvictionSide.YES,
      rate: 1_000_000n,
      deposit: 50_000_000n
    });

    assert.equal(result.txHash, txHash);
    assert.equal(result.vaultId, expectedVaultId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].fn, "createVault");
  });

  it("registers an agent in AgentRegistry", async () => {
    const txHash = ("0x" + "66".repeat(32)) as Hex;
    let writeCalled = false;

    const mockPublic = {
      waitForTransactionReceipt: async () => ({ status: "success" })
    } as unknown as PublicClient;

    const mockWallet = {
      account: TEST_ACCOUNT,
      chain: undefined,
      writeContract: async ({ functionName, address, args }: { functionName: string; address: Address; args: unknown[] }) => {
        writeCalled = true;
        assert.equal(functionName, "registerAgent");
        assert.equal(address, MOCK_ADDRESSES.agentRegistry);
        assert.equal(args[0], TEST_ACCOUNT.address);
        assert.equal(args[1], "Agent Config Metadata");
        return txHash;
      }
    } as unknown as WalletClient;

    const writer = createOptionsWriter({
      walletClient: mockWallet,
      publicClient: mockPublic,
      addresses: MOCK_ADDRESSES
    });

    const hash = await writer.registerAgent({
      agent: TEST_ACCOUNT.address,
      metadata: "Agent Config Metadata"
    });

    assert.ok(writeCalled);
    assert.equal(hash, txHash);
  });
});

