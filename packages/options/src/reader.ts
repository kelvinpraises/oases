import {
  type Address,
  type Hex,
  type PublicClient,
  zeroAddress
} from "viem";
import {
  agentRegistryAbi,
  marketRegistryAbi,
  vaultAbi,
  marketDriverAbi,
  mockUsdcAbi,
  staticAddresses,
  type DeploymentName
} from "@oases/contracts";
import {
  ConvictionSide,
  type MarketRecord,
  type VaultRecord,
  type BoardRecord,
  type PositionRecord,
  type ClaimableRecord,
  type LaneRecord
} from "./types.js";

export interface OptionsAddresses {
  readonly marketRegistry: Address;
  readonly vault: Address;
  readonly marketDriver: Address;
  readonly mockUsdc: Address;
  readonly agentRegistry?: Address;
  readonly vaultDriver?: Address;
}

export interface OptionsReaderConfig {
  readonly publicClient: PublicClient;
  readonly addresses?: Partial<OptionsAddresses>;
  readonly deployment?: DeploymentName;
}

export interface OptionsReader {
  readonly addresses: OptionsAddresses;
  readMarket(marketId: Hex): Promise<MarketRecord>;
  listMarketVaults(marketId: Hex): Promise<readonly Hex[]>;
  readVault(vaultId: Hex): Promise<VaultRecord>;
  readBoard(vaultId: Hex, side: ConvictionSide): Promise<BoardRecord>;
  readPosition(vaultId: Hex, side: ConvictionSide, account: bigint): Promise<PositionRecord>;
  readPendingShares(vaultId: Hex, side: ConvictionSide, account: bigint): Promise<bigint>;
  readSharePrice(vaultId: Hex, side: ConvictionSide): Promise<bigint>;
  readClaimable(vaultId: Hex, account: bigint): Promise<ClaimableRecord>;
  listOwnerTokens(owner: Address): Promise<readonly bigint[]>;
  readNftLanes(tokenId: bigint): Promise<readonly LaneRecord[]>;
  readUsdcBalance(owner: Address): Promise<bigint>;
  readUsdcAllowance(owner: Address, spender: Address): Promise<bigint>;
  readAgentAuthorization(agent: Address): Promise<boolean>;
  readAgentMetadata(agent: Address): Promise<string>;
}

function resolveAddresses(config: OptionsReaderConfig): OptionsAddresses {
  const deployment = config.deployment ?? "localhost";
  const defaults = staticAddresses[deployment] ?? staticAddresses.localhost;
  const marketRegistry = config.addresses?.marketRegistry ?? defaults?.marketRegistry;
  const vault = config.addresses?.vault ?? defaults?.vault;
  const marketDriver = config.addresses?.marketDriver ?? defaults?.marketDriver;
  const mockUsdc = config.addresses?.mockUsdc ?? defaults?.mockUsdc;
  const agentRegistry = config.addresses?.agentRegistry ?? defaults?.agentRegistry;
  const vaultDriver = config.addresses?.vaultDriver ?? defaults?.vaultDriver;

  if (!marketRegistry || !vault || !marketDriver || !mockUsdc) {
    throw new Error(`OptionsReader: Missing required contract addresses for '${deployment}'`);
  }

  return { marketRegistry, vault, marketDriver, mockUsdc, agentRegistry, vaultDriver };
}

function toSideNumber(side: ConvictionSide | number): number {
  return side === ConvictionSide.NO || (side as number) === 1 ? 1 : 0;
}

export function createOptionsReader(config: OptionsReaderConfig): OptionsReader {
  const { publicClient } = config;
  const addresses = resolveAddresses(config);

  return {
    addresses,

    async readMarket(marketId: Hex): Promise<MarketRecord> {
      try {
        const exists = await publicClient.readContract({
          address: addresses.marketRegistry,
          abi: marketRegistryAbi,
          functionName: "marketExists",
          args: [marketId]
        });

        if (!exists) {
          return {
            id: marketId,
            creator: zeroAddress,
            name: "",
            description: "",
            createdAt: 0,
            exists: false
          };
        }

        const data = await publicClient.readContract({
          address: addresses.marketRegistry,
          abi: marketRegistryAbi,
          functionName: "getMarket",
          args: [marketId]
        });

        return {
          id: data.id,
          creator: data.creator,
          name: data.title,
          description: data.title,
          createdAt: Number(data.createdAt),
          exists: data.exists
        };
      } catch {
        return {
          id: marketId,
          creator: zeroAddress,
          name: "",
          description: "",
          createdAt: 0,
          exists: false
        };
      }
    },

    async listMarketVaults(marketId: Hex): Promise<readonly Hex[]> {
      try {
        const exists = await publicClient.readContract({
          address: addresses.marketRegistry,
          abi: marketRegistryAbi,
          functionName: "marketExists",
          args: [marketId]
        });
        if (!exists) return [];

        const vaultIds = await publicClient.readContract({
          address: addresses.marketRegistry,
          abi: marketRegistryAbi,
          functionName: "getVaultIds",
          args: [marketId]
        });
        return vaultIds;
      } catch {
        return [];
      }
    },

    async readVault(vaultId: Hex): Promise<VaultRecord> {
      const [vData, pools, solverCfg] = await Promise.all([
        publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "vaults",
          args: [vaultId]
        }),
        publicClient
          .readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "getVaultPools",
            args: [vaultId]
          })
          .catch(() => [0n, 0n, 0n, 0n] as const),
        publicClient
          .readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "solverConfig",
            args: [vaultId]
          })
          .catch(() => "")
      ]);

      return {
        id: vData[0],
        marketId: vData[1],
        question: vData[2],
        solverConfig: solverCfg || vData[3],
        creator: vData[4],
        status: Number(vData[5]),
        outcome: Number(vData[6]),
        resolvedAt: Number(vData[7]),
        exists: vData[8],
        yesPool: pools[0],
        noPool: pools[1],
        yesShares: pools[2],
        noShares: pools[3]
      };
    },

    async readBoard(vaultId: Hex, side: ConvictionSide): Promise<BoardRecord> {
      const sideNum = toSideNumber(side);
      const board = await publicClient.readContract({
        address: addresses.vault,
        abi: vaultAbi,
        functionName: "getBoard",
        args: [vaultId, sideNum]
      });

      return {
        pool: board.pool,
        sideRate: board.sideRate,
        g: board.g,
        lastAdvance: Number(board.lastAdvance),
        sideShares: board.sideShares
      };
    },

    async readPosition(vaultId: Hex, side: ConvictionSide, account: bigint): Promise<PositionRecord> {
      const sideNum = toSideNumber(side);
      const [pos, pending] = await Promise.all([
        publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "getPositionStruct",
          args: [vaultId, sideNum, account]
        }),
        publicClient
          .readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "pendingShares",
            args: [vaultId, sideNum, account]
          })
          .catch(() => 0n)
      ]);

      return {
        rate: pos.rate,
        gPaid: pos.gPaid,
        sharesAccrued: pos.sharesAccrued,
        maxEnd: Number(pos.maxEnd),
        depleted: pos.depleted,
        pendingShares: pending
      };
    },

    async readPendingShares(vaultId: Hex, side: ConvictionSide, account: bigint): Promise<bigint> {
      const sideNum = toSideNumber(side);
      return await publicClient.readContract({
        address: addresses.vault,
        abi: vaultAbi,
        functionName: "pendingShares",
        args: [vaultId, sideNum, account]
      });
    },

    async readSharePrice(vaultId: Hex, side: ConvictionSide): Promise<bigint> {
      const sideNum = toSideNumber(side);
      return await publicClient.readContract({
        address: addresses.vault,
        abi: vaultAbi,
        functionName: "getSharePrice",
        args: [vaultId, sideNum]
      });
    },

    async readClaimable(vaultId: Hex, account: bigint): Promise<ClaimableRecord> {
      const v = await publicClient.readContract({
        address: addresses.vault,
        abi: vaultAbi,
        functionName: "vaults",
        args: [vaultId]
      });

      const status = Number(v[5]); // Status: 0=Open, 1=Hot, 2=Locked, 3=Resolved, 4=Disputed
      const outcome = Number(v[6]); // Outcome: 0=Pending, 1=Yes, 2=No
      const isResolved = status === 3;

      if (!isResolved || outcome === 0) {
        return { claimable: 0n, winningSide: undefined, isResolved: false };
      }

      const winningSide = outcome === 1 ? ConvictionSide.YES : ConvictionSide.NO;
      const winningSideNum = outcome === 1 ? 0 : 1;

      const isClaimed = await publicClient.readContract({
        address: addresses.vault,
        abi: vaultAbi,
        functionName: "claimed",
        args: [vaultId, winningSideNum, account]
      });

      if (isClaimed) {
        return { claimable: 0n, winningSide, isResolved: true };
      }

      const [pos, boardWin, boardLose, potFrozen, isCollected] = await Promise.all([
        publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "getPositionStruct",
          args: [vaultId, winningSideNum, account]
        }),
        publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "getBoard",
          args: [vaultId, winningSideNum]
        }),
        publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "getBoard",
          args: [vaultId, winningSideNum === 0 ? 1 : 0]
        }),
        publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "pot",
          args: [vaultId]
        }),
        publicClient.readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "collected",
          args: [vaultId]
        })
      ]);

      let totalPot = potFrozen;
      if (!isCollected) {
        const yieldP = await publicClient
          .readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "yieldPot",
            args: [vaultId]
          })
          .catch(() => 0n);
        totalPot = boardWin.pool + boardLose.pool + yieldP;
      }

      let winningShares = boardWin.sideShares;
      let userShares = pos.sharesAccrued;
      if (pos.rate > 0n) {
        userShares += pos.rate * (boardWin.g - pos.gPaid);
      }

      let activeSideNum = winningSideNum;
      if (winningShares === 0n) {
        const otherSideNum = winningSideNum === 0 ? 1 : 0;
        if (boardLose.sideShares > 0n) {
          activeSideNum = otherSideNum;
          winningShares = boardLose.sideShares;
          const posLose = await publicClient.readContract({
            address: addresses.vault,
            abi: vaultAbi,
            functionName: "getPositionStruct",
            args: [vaultId, otherSideNum, account]
          });
          userShares = posLose.sharesAccrued;
          if (posLose.rate > 0n) {
            userShares += posLose.rate * (boardLose.g - posLose.gPaid);
          }
        }
      }

      let payout = 0n;
      if (userShares > 0n && winningShares > 0n) {
        payout = (totalPot * userShares) / winningShares;
      }

      const overage = await publicClient
        .readContract({
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "overageOwed",
          args: [vaultId, activeSideNum, account]
        })
        .catch(() => 0n);

      payout += overage;

      return {
        claimable: payout,
        winningSide,
        isResolved: true
      };
    },

    async listOwnerTokens(owner: Address): Promise<readonly bigint[]> {
      try {
        return await publicClient.readContract({
          address: addresses.marketDriver,
          abi: marketDriverAbi,
          functionName: "tokensOfOwner",
          args: [owner]
        });
      } catch {
        return [];
      }
    },

    async readNftLanes(tokenId: bigint): Promise<readonly LaneRecord[]> {
      try {
        const count = await publicClient.readContract({
          address: addresses.marketDriver,
          abi: marketDriverAbi,
          functionName: "laneCount",
          args: [tokenId]
        });

        const lanes: LaneRecord[] = [];
        for (let i = 0n; i < count; i++) {
          const [vaultId, sideNum, rate] = await publicClient.readContract({
            address: addresses.marketDriver,
            abi: marketDriverAbi,
            functionName: "laneAt",
            args: [tokenId, i]
          });
          lanes.push({
            vaultId,
            side: sideNum === 0 ? ConvictionSide.YES : ConvictionSide.NO,
            rate
          });
        }
        return lanes;
      } catch {
        return [];
      }
    },

    async readUsdcBalance(owner: Address): Promise<bigint> {
      return await publicClient.readContract({
        address: addresses.mockUsdc,
        abi: mockUsdcAbi,
        functionName: "balanceOf",
        args: [owner]
      });
    },

    async readUsdcAllowance(owner: Address, spender: Address): Promise<bigint> {
      return await publicClient.readContract({
        address: addresses.mockUsdc,
        abi: mockUsdcAbi,
        functionName: "allowance",
        args: [owner, spender]
      });
    },

    async readAgentAuthorization(agent: Address): Promise<boolean> {
      if (!addresses.agentRegistry) {
        throw new Error("OptionsReader: agentRegistry address is not configured");
      }
      return await publicClient.readContract({
        address: addresses.agentRegistry,
        abi: agentRegistryAbi,
        functionName: "isAuthorizedAgent",
        args: [agent]
      });
    },

    async readAgentMetadata(agent: Address): Promise<string> {
      if (!addresses.agentRegistry) {
        throw new Error("OptionsReader: agentRegistry address is not configured");
      }
      return await publicClient.readContract({
        address: addresses.agentRegistry,
        abi: agentRegistryAbi,
        functionName: "agentMetadata",
        args: [agent]
      });
    }
  };
}
