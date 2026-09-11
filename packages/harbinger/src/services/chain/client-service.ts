import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  stringToHex,
  isHex,
  pad,
  type PublicClient,
  type WalletClient,
  type Account,
  type Hash,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { HarbingerConfig } from "@/config";
import type { ReplayTicket } from "@/models/ReplayTicket";
import { verifyReplayTicket } from "@/services/oracle/attestation-service";
import type { JournalService } from "@/services/journal/journal-service";
import {
  type SettlementOutcome,
  type SettlementResult,
  OUTCOME_ENUM_MAP,
  InsufficientGasBalanceError,
  SettlementVerificationError,
} from "./types";

// Minimal ABI for Vault.sol resolution inspection and execution
export const VAULT_ABI = parseAbi([
  "function resolve(bytes32 vaultId, uint8 outcome) external",
  "function vaults(bytes32 vaultId) external view returns (bytes32 id, bytes32 marketId, string question, string solverConfig, address creator, uint8 status, uint8 outcome, uint32 resolvedAt, bool exists)",
]);

export const MIN_GAS_BUFFER_WEI = 5_000_000_000_000_000n; // 0.005 ETH

export function formatBytes32(id: string): `0x${string}` {
  if (isHex(id) && id.length === 66) {
    return id as `0x${string}`;
  }
  if (id.startsWith("0x")) {
    return pad(id as `0x${string}`, { size: 32 });
  }
  return stringToHex(id, { size: 32 });
}

export class ChainClientService {
  public publicClient: PublicClient;
  public walletClient?: WalletClient;
  public account?: Account;
  private txQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private config: HarbingerConfig,
    private journalService?: JournalService,
    customClients?: {
      publicClient?: PublicClient;
      walletClient?: WalletClient;
      account?: Account;
    },
  ) {
    if (customClients?.publicClient) {
      this.publicClient = customClients.publicClient;
    } else {
      this.publicClient = createPublicClient({
        transport: http(config.rpcUrl),
      });
    }

    if (customClients?.account) {
      this.account = customClients.account;
      this.walletClient = customClients.walletClient;
    } else if (config.operatorPrivateKey) {
      this.account = privateKeyToAccount(
        config.operatorPrivateKey as `0x${string}`,
      );
      this.walletClient = createWalletClient({
        account: this.account,
        transport: http(config.rpcUrl),
      });
    }
  }

  /**
   * Serializes on-chain transactions into a single FIFO queue to eliminate nonce collisions (Axiom 5.3).
   * Ensures subsequent transactions execute even if a prior transaction in the queue fails.
   */
  public async executeSerializedTx<T>(txFactory: () => Promise<T>): Promise<T> {
    const nextInQueue = this.txQueue.then(
      async () => {
        return await txFactory();
      },
      async () => {
        // Continue queue even if previous tx failed
        return await txFactory();
      },
    );

    this.txQueue = nextInQueue.catch(() => {});
    return nextInQueue;
  }

  /**
   * Checks whether a vault is already resolved on-chain (Axiom 5.2).
   */
  public async isVaultResolved(
    vaultAddress: Address,
    vaultId: string,
  ): Promise<boolean> {
    try {
      const formattedVaultId = formatBytes32(vaultId);
      const data = (await this.publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: "vaults",
        args: [formattedVaultId],
      })) as [
        `0x${string}`,
        `0x${string}`,
        string,
        string,
        `0x${string}`,
        number,
        number,
        number,
        boolean,
      ];
      // status enum: 0=Open, 1=Hot, 2=Locked, 3=Resolved, 4=Disputed
      const status = data[5];
      return status === 3;
    } catch {
      return false;
    }
  }

  /**
   * Asserts that the operator wallet holds sufficient native gas token.
   */
  public async assertSufficientGasBalance(
    minBalanceWei = MIN_GAS_BUFFER_WEI,
  ): Promise<void> {
    if (!this.account) return;
    const balance = await this.publicClient.getBalance({
      address: this.account.address,
    });
    if (balance < minBalanceWei) {
      throw new InsufficientGasBalanceError(
        balance,
        minBalanceWei,
        this.account.address,
      );
    }
  }

  /**
   * Resolves a vault on-chain:
   * 1. If Outcome.Yes: strictly verifies ReplayTicket cryptographically (Axiom 5.1).
   * 2. Asserts sufficient gas balance.
   * 3. Checks idempotency: skips if already resolved (Axiom 5.2).
   * 4. Dispatches transaction via serialized nonce queue (Axiom 5.3).
   * 5. Waits for 1 confirmation and records forensic journal entry (Axiom 5.5).
   */
  public async resolveVault(
    vaultAddress: Address,
    vaultId: string,
    outcome: SettlementOutcome,
    replayTicket?: ReplayTicket,
  ): Promise<SettlementResult> {
    if (!this.walletClient || !this.account) {
      throw new Error("Cannot resolve vault: no operator wallet configured");
    }

    // 1. Proof-Gated Settlement Verification (Axiom 5.1)
    if (outcome === "Yes") {
      if (!replayTicket) {
        throw new SettlementVerificationError(
          vaultId,
          "Missing ReplayTicket for Outcome.Yes resolution",
        );
      }
      const verification = verifyReplayTicket(replayTicket);
      if (!verification.valid) {
        throw new SettlementVerificationError(
          vaultId,
          verification.errors && verification.errors.length > 0
            ? verification.errors.join("; ")
            : "ReplayTicket cryptographic verification failed",
        );
      }
    }

    // 2. Gas Balance Check
    await this.assertSufficientGasBalance();

    const replayTicketHash = replayTicket
      ? createHash("sha256").update(JSON.stringify(replayTicket)).digest("hex")
      : undefined;

    // 3. Idempotency Check (Axiom 5.2)
    const alreadyResolved = await this.isVaultResolved(vaultAddress, vaultId);
    if (alreadyResolved) {
      const currentBlock = Number(await this.publicClient.getBlockNumber());
      return {
        vaultId,
        outcome,
        txHash:
          "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
        blockNumber: currentBlock,
        gasUsed: 0n,
        replayTicketHash,
        timestamp: Date.now(),
      };
    }

    const outcomeEnum = OUTCOME_ENUM_MAP[outcome];
    const formattedVaultId = formatBytes32(vaultId);

    // 4. Submit via Serialized Nonce Queue (Axiom 5.3)
    return await this.executeSerializedTx(async () => {
      // Re-check idempotency inside queue to prevent race between queued transactions
      const innerAlreadyResolved = await this.isVaultResolved(
        vaultAddress,
        vaultId,
      );
      if (innerAlreadyResolved) {
        const currentBlock = Number(await this.publicClient.getBlockNumber());
        return {
          vaultId,
          outcome,
          txHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
          blockNumber: currentBlock,
          gasUsed: 0n,
          replayTicketHash,
          timestamp: Date.now(),
        };
      }

      // Dynamic EIP-1559 gas calculation with 25% buffer
      let maxFeePerGas: bigint | undefined;
      let maxPriorityFeePerGas: bigint | undefined;
      try {
        const feeEstimates = await this.publicClient.estimateFeesPerGas();
        maxFeePerGas = feeEstimates.maxFeePerGas
          ? (feeEstimates.maxFeePerGas * 125n) / 100n
          : undefined;
        maxPriorityFeePerGas = feeEstimates.maxPriorityFeePerGas
          ? (feeEstimates.maxPriorityFeePerGas * 125n) / 100n
          : undefined;
      } catch {
        // Fallback to undefined if RPC does not support fee estimation
      }

      const txHash = await this.walletClient!.writeContract({
        account: this.account!,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: "resolve",
        args: [formattedVaultId, outcomeEnum],
        chain: null,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      // 5. Wait for 1 Confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      const blockNumber = Number(receipt.blockNumber);
      const gasUsed = receipt.gasUsed;

      const result: SettlementResult = {
        vaultId,
        outcome,
        txHash,
        blockNumber,
        gasUsed,
        replayTicketHash,
        timestamp: Date.now(),
      };

      // 6. Record Forensic Journal Entry (Axiom 5.5)
      if (this.journalService) {
        await this.journalService.recordThought({
          level: "RESOLUTION",
          type: "RESOLUTION_VERDICT",
          source: "settlement_bridge",
          thought: `Settled vault ${vaultId} on-chain with Outcome.${outcome}. TxHash: ${txHash} (Block ${blockNumber}, Gas Used: ${gasUsed.toString()}).`,
          confidenceScore: 1.0,
          metadata: {
            vaultId,
            outcome,
            txHash,
            blockNumber,
            gasUsed: gasUsed.toString(),
            replayTicketHash,
          },
        });
      }

      return result;
    });
  }

  public async getBlockNumber(): Promise<number> {
    const block = await this.publicClient.getBlockNumber();
    return Number(block);
  }
}

