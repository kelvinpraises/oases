import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { HarbingerConfig } from "../../config";

export class ChainClientService {
  public readonly publicClient: PublicClient;
  public readonly walletClient?: WalletClient;
  public readonly account?: Account;
  private txQueue: Promise<unknown> = Promise.resolve();

  constructor(config: HarbingerConfig) {
    this.publicClient = createPublicClient({
      transport: http(config.rpcUrl),
    });

    if (config.operatorPrivateKey) {
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
   * Serializes on-chain transactions into a single FIFO queue to eliminate nonce collisions.
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

  public async getBlockNumber(): Promise<number> {
    const block = await this.publicClient.getBlockNumber();
    return Number(block);
  }
}
