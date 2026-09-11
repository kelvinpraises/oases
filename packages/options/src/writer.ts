import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  maxUint256,
  parseEventLogs,
  zeroAddress
} from "viem";
import {
  marketDriverAbi,
  mockUsdcAbi,
  vaultAbi,
  staticAddresses,
  type DeploymentName
} from "@oases/contracts";
import { ConvictionSide, type LaneRecord } from "./types.js";
import type { OptionsAddresses } from "./reader.js";

export interface OptionsWriterConfig {
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly addresses?: Partial<OptionsAddresses>;
  readonly deployment?: DeploymentName;
}

export interface OptionsWriter {
  readonly addresses: OptionsAddresses;
  mintFunderNft(input: { marketId: Hex; to: Address }): Promise<{ txHash: Hex; tokenId: bigint }>;
  mintWithSalt(input: { marketId: Hex; salt: bigint; to: Address }): Promise<{ txHash: Hex; tokenId: bigint }>;
  fundStream(input: {
    tokenId: bigint;
    vaultId: Hex;
    side: ConvictionSide;
    rate: bigint;
    deposit: bigint;
  }): Promise<Hex>;
  setLanes(input: {
    tokenId: bigint;
    lanes: readonly LaneRecord[];
    addDeposit: bigint;
  }): Promise<Hex>;
  stopFunding(input: { tokenId: bigint; vaultId: Hex; side: ConvictionSide }): Promise<Hex>;
  stopAllFunding(input: { tokenId: bigint; to?: Address }): Promise<Hex>;
  withdraw(input: { tokenId: bigint; vaultId: Hex; to?: Address }): Promise<Hex>;
  withdrawBatch(input: { tokenId: bigint; vaultIds: readonly Hex[]; to?: Address }): Promise<Hex>;
  advance(input: { vaultId: Hex; side: ConvictionSide; maxSteps?: bigint }): Promise<Hex>;
  approveUsdc(input: { spender: Address; amount?: bigint }): Promise<Hex>;
}

function resolveAddresses(config: OptionsWriterConfig): OptionsAddresses {
  const deployment = config.deployment ?? "localhost";
  const defaults = staticAddresses[deployment] ?? staticAddresses.localhost;
  const marketRegistry = config.addresses?.marketRegistry ?? defaults?.marketRegistry;
  const vault = config.addresses?.vault ?? defaults?.vault;
  const marketDriver = config.addresses?.marketDriver ?? defaults?.marketDriver;
  const mockUsdc = config.addresses?.mockUsdc ?? defaults?.mockUsdc;

  if (!marketRegistry || !vault || !marketDriver || !mockUsdc) {
    throw new Error(`OptionsWriter: Missing required contract addresses for '${deployment}'`);
  }

  return { marketRegistry, vault, marketDriver, mockUsdc };
}

function toSideNumber(side: ConvictionSide | number): number {
  return side === ConvictionSide.NO || (side as number) === 1 ? 1 : 0;
}

export function createOptionsWriter(config: OptionsWriterConfig): OptionsWriter {
  const { walletClient, publicClient } = config;
  const addresses = resolveAddresses(config);

  const getAccount = () => {
    const account = walletClient.account;
    if (!account) {
      throw new Error("OptionsWriter: WalletClient must have an account configured for EOA transactions");
    }
    return account;
  };

  const ensureAllowance = async (requiredAmount: bigint) => {
    if (requiredAmount <= 0n) return;
    const account = getAccount();
    const currentAllowance = await publicClient.readContract({
      address: addresses.mockUsdc,
      abi: mockUsdcAbi,
      functionName: "allowance",
      args: [account.address, addresses.marketDriver]
    });

    if (currentAllowance < requiredAmount) {
      const approveHash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.mockUsdc,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [addresses.marketDriver, maxUint256]
      } as never);
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
  };

  return {
    addresses,

    async mintFunderNft(input: { marketId: Hex; to: Address }): Promise<{ txHash: Hex; tokenId: bigint }> {
      const account = getAccount();
      const txHash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "mint",
        args: [input.marketId, input.to]
      } as never);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: marketDriverAbi,
        logs: receipt.logs,
        eventName: "MarketNftMinted"
      });

      if (logs.length > 0 && logs[0].args.tokenId !== undefined) {
        return { txHash, tokenId: logs[0].args.tokenId };
      }

      // Fallback: extract tokenId if event format differed
      throw new Error("MarketNftMinted event not found in transaction receipt");
    },

    async mintWithSalt(input: {
      marketId: Hex;
      salt: bigint;
      to: Address;
    }): Promise<{ txHash: Hex; tokenId: bigint }> {
      const account = getAccount();
      const txHash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "mintWithSalt",
        args: [input.marketId, BigInt(input.salt), input.to]
      } as never);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: marketDriverAbi,
        logs: receipt.logs,
        eventName: "MarketNftMinted"
      });

      if (logs.length > 0 && logs[0].args.tokenId !== undefined) {
        return { txHash, tokenId: logs[0].args.tokenId };
      }

      throw new Error("MarketNftMinted event not found in transaction receipt");
    },

    async fundStream(input: {
      tokenId: bigint;
      vaultId: Hex;
      side: ConvictionSide;
      rate: bigint;
      deposit: bigint;
    }): Promise<Hex> {
      const account = getAccount();
      await ensureAllowance(input.deposit);

      const sideNum = toSideNumber(input.side);
      const hash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "fund",
        args: [input.tokenId, input.vaultId, sideNum, input.rate, input.deposit]
      } as never);

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async setLanes(input: {
      tokenId: bigint;
      lanes: readonly LaneRecord[];
      addDeposit: bigint;
    }): Promise<Hex> {
      const account = getAccount();
      if (input.addDeposit > 0n) {
        await ensureAllowance(input.addDeposit);
      }

      const desired = input.lanes.map((lane) => ({
        vaultId: lane.vaultId,
        side: toSideNumber(lane.side),
        rate: lane.rate
      }));

      const hash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "setLanes",
        args: [input.tokenId, desired, input.addDeposit]
      } as never);

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async stopFunding(input: { tokenId: bigint; vaultId: Hex; side: ConvictionSide }): Promise<Hex> {
      const account = getAccount();
      const sideNum = toSideNumber(input.side);

      const hash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "stop",
        args: [input.tokenId, input.vaultId, sideNum]
      } as never);

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async stopAllFunding(input: { tokenId: bigint; to?: Address }): Promise<Hex> {
      const account = getAccount();
      const recipient = input.to ?? zeroAddress;

      const hash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "stopAll",
        args: [input.tokenId, recipient]
      } as never);

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async withdraw(input: { tokenId: bigint; vaultId: Hex; to?: Address }): Promise<Hex> {
      const account = getAccount();
      const recipient = input.to ?? zeroAddress;

      const hash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "withdraw",
        args: [input.tokenId, input.vaultId, recipient]
      } as never);

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async withdrawBatch(input: { tokenId: bigint; vaultIds: readonly Hex[]; to?: Address }): Promise<Hex> {
      const account = getAccount();
      const recipient = input.to ?? zeroAddress;

      const hash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.marketDriver,
        abi: marketDriverAbi,
        functionName: "withdraw",
        args: [input.tokenId, input.vaultIds as Hex[], recipient]
      } as never);

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async advance(input: { vaultId: Hex; side: ConvictionSide; maxSteps?: bigint }): Promise<Hex> {
      const account = getAccount();
      const sideNum = toSideNumber(input.side);

      let hash: Hex;
      if (input.maxSteps !== undefined) {
        hash = await walletClient.writeContract({
          account,
          chain: walletClient.chain,
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "advance",
          args: [input.vaultId, sideNum, input.maxSteps]
        } as never);
      } else {
        hash = await walletClient.writeContract({
          account,
          chain: walletClient.chain,
          address: addresses.vault,
          abi: vaultAbi,
          functionName: "advance",
          args: [input.vaultId, sideNum]
        } as never);
      }

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },

    async approveUsdc(input: { spender: Address; amount?: bigint }): Promise<Hex> {
      const account = getAccount();
      const amount = input.amount ?? maxUint256;

      const hash = await walletClient.writeContract({
        account,
        chain: walletClient.chain,
        address: addresses.mockUsdc,
        abi: mockUsdcAbi,
        functionName: "approve",
        args: [input.spender, amount]
      } as never);

      await publicClient.waitForTransactionReceipt({ hash });
      return hash;
    }
  };
}
