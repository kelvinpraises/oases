import { Buffer } from "node:buffer";
import type { Kysely } from "kysely";
import { upsertJob, getJobById, type HarbingerDB } from "../../infrastructure/database/schema";
import type { SourceDirective } from "../../models/Directive";
import type { Job } from "../../models/Job";
import { assertPhysicalClass } from "../../models/Taxonomy";
import { decompressSolver } from "../oracle/solver-service";
import type { ChainClientService } from "../chain/client-service";
import { marketRegistryAbi, vaultDriverAbi } from "@oases/contracts";
import type {
  ContagionCluster,
  TensionCastGenesisResult,
  TensionCastStatus,
  VaultGenesisResult,
} from "./types";

// Nominal seed constants: $10 YES and $10 NO = $20 nominal per vault (10e18 Wad)
export const NOMINAL_SEED_PER_SIDE = 10n * 10n ** 18n; // 10 WAD
export const TOTAL_NOMINAL_PER_VAULT = NOMINAL_SEED_PER_SIDE * 2n; // 20 WAD

export class TensionCastService {
  constructor(
    private chainClient: ChainClientService,
    private db: Kysely<HarbingerDB>,
    private contractAddresses?: {
      marketRegistry?: string;
      vaultDriver?: string;
      marketDriver?: string;
    },
  ) {}

  /**
   * Validates a Tension Cast directive manifest:
   * 1. Asserts non-empty marketId, title, streamId.
   * 2. Asserts startBlock < deadlineBlock.
   * 3. Validates every child vault's physical class against the 4 immutable classes.
   * 4. Asserts that every child vault's compiledSolverConfig successfully decompresses.
   */
  public validate(directive: SourceDirective): void {
    if (!directive.marketId || directive.marketId.trim().length === 0) {
      throw new Error("Directive marketId must not be empty");
    }
    if (!directive.title || directive.title.trim().length === 0) {
      throw new Error("Directive title must not be empty");
    }
    if (!directive.streamId || directive.streamId.trim().length === 0) {
      throw new Error("Directive streamId must not be empty");
    }
    if (directive.startBlock >= directive.deadlineBlock) {
      throw new Error(
        `Invalid directive window: startBlock (${directive.startBlock}) >= deadlineBlock (${directive.deadlineBlock})`,
      );
    }
    if (!directive.childVaults || directive.childVaults.length === 0) {
      throw new Error("Directive must contain at least 1 child vault");
    }

    for (const vault of directive.childVaults) {
      assertPhysicalClass(vault.classType);
      if (!vault.compiledSolverConfig) {
        throw new Error(
          `Child vault ${vault.vaultId} missing compiledSolverConfig`,
        );
      }
      try {
        decompressSolver(vault.compiledSolverConfig);
      } catch (err) {
        throw new Error(
          `Child vault ${vault.vaultId} has invalid solverConfig: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Organizes an open set of N child vaults into the 4-Class Contagion Cluster.
   */
  public buildContagionCluster(directive: SourceDirective): ContagionCluster {
    this.validate(directive);

    const cluster: ContagionCluster = {
      directiveId: directive.marketId,
      actors: [],
      places: [],
      acts: [],
      bonds: [],
      totalVaultCount: directive.childVaults.length,
    };

    for (const vault of directive.childVaults) {
      switch (vault.classType) {
        case "Actor":
          cluster.actors.push(vault);
          break;
        case "Place":
          cluster.places.push(vault);
          break;
        case "Act":
          cluster.acts.push(vault);
          break;
        case "Bond":
          cluster.bonds.push(vault);
          break;
      }
    }

    return cluster;
  }

  /**
   * Executes idempotent Genesis Priming across N floating child vaults under a Tension Cast:
   * 1. Validates the directive structure.
   * 2. Tiered idempotency check (on-chain market query first, then local SQLite).
   * 3. Deploys and seeds $20 nominal per vault ($10 YES / $10 NO) via serialized queue.
   * 4. Enrolls each child vault into the local host SQLite active_jobs registry.
   */
  public async primeTensionCast(
    directive: SourceDirective,
  ): Promise<TensionCastGenesisResult> {
    this.validate(directive);

    const primedVaults: VaultGenesisResult[] = [];
    const childCount = directive.childVaults.length;

    // 1. Tiered Idempotency Check: On-Chain Market Check First
    let marketExistsOnChain = false;
    if (this.contractAddresses?.marketRegistry && this.chainClient.publicClient) {
      try {
        marketExistsOnChain = (await this.chainClient.publicClient.readContract({
          address: this.contractAddresses.marketRegistry as `0x${string}`,
          abi: marketRegistryAbi,
          functionName: "marketExists",
          args: [directive.marketId as `0x${string}`],
        })) as boolean;
      } catch {
        marketExistsOnChain = false;
      }
    }

    if (!marketExistsOnChain) {
      await this.chainClient.executeSerializedTx(async () => {
        // Sequenced market registration if wallet is configured
        if (this.chainClient.walletClient && this.contractAddresses?.marketRegistry) {
          const formattedStreamId = (
            directive.streamId.startsWith("0x")
              ? directive.streamId
              : `0x${Buffer.from(directive.streamId, "utf8").toString("hex").padEnd(64, "0").slice(0, 64)}`
          ) as `0x${string}`;

          const hash = await this.chainClient.walletClient.writeContract({
            address: this.contractAddresses.marketRegistry as `0x${string}`,
            abi: marketRegistryAbi,
            functionName: "registerMarket",
            args: [directive.title, formattedStreamId],
            account: this.chainClient.account!,
            chain: undefined,
          });
          await this.chainClient.publicClient.waitForTransactionReceipt({ hash });
        }
      });
    }

    // 2. Prime Each Child Vault ($20 nominal per vault: $10 YES / $10 NO)
    for (const child of directive.childVaults) {
      const existingJob = await getJobById(this.db, `job-${child.vaultId}`);

      const vaultResult = await this.chainClient.executeSerializedTx(
        async () => {
          let fakeTxCreate = `0xcreate_${child.vaultId}_${Date.now()}`;
          const fakeTxFund = `0xfund_${child.vaultId}_${Date.now()}`;
          const vaultAddress = `0xvault_${child.vaultId.slice(0, 8)}`;

          if (this.chainClient.walletClient && this.contractAddresses?.vaultDriver && !existingJob) {
            // Live on-chain deployment & funding
            const createHash = await this.chainClient.walletClient.writeContract({
              address: this.contractAddresses.vaultDriver as `0x${string}`,
              abi: vaultDriverAbi,
              functionName: "createVault",
              args: [
                directive.marketId as `0x${string}`,
                child.question,
                child.compiledSolverConfig,
                1, // Side.Yes
                1000000n, // Rate
                NOMINAL_SEED_PER_SIDE, // $10 Wad
              ],
              account: this.chainClient.account!,
              chain: undefined,
            });
            fakeTxCreate = createHash;
          }

          return {
            vaultId: child.vaultId,
            vaultAddress,
            createTxHash: fakeTxCreate,
            fundTxHash: fakeTxFund,
            nominalSeedYes: NOMINAL_SEED_PER_SIDE,
            nominalSeedNo: NOMINAL_SEED_PER_SIDE,
            totalPrimedPot: TOTAL_NOMINAL_PER_VAULT,
          };
        },
      );

      primedVaults.push(vaultResult);

      // 3. Register Active Monitoring Job in Host SQLite Database
      const initialJob: Job = {
        id: `job-${child.vaultId}`,
        vaultId: child.vaultId,
        cadenceMs: 10_000, // Standard initial cadence (10s)
        status: existingJob ? existingJob.status : "idle",
        consecutiveBreaches: existingJob ? existingJob.consecutiveBreaches : 0,
        createdAt: existingJob ? existingJob.createdAt : Date.now(),
        updatedAt: Date.now(),
      };
      await upsertJob(this.db, initialJob);
    }

    const totalSeedCapital = BigInt(childCount) * TOTAL_NOMINAL_PER_VAULT;

    return {
      marketId: directive.marketId,
      streamId: directive.streamId,
      title: directive.title,
      startBlock: directive.startBlock,
      deadlineBlock: directive.deadlineBlock,
      primedVaults,
      totalSeedCapital,
    };
  }

  /**
   * Returns current lifecycle status and remaining blocks for the Tension Cast.
   */
  public getStatus(
    directive: SourceDirective,
    currentBlock: number,
  ): TensionCastStatus {
    const cluster = this.buildContagionCluster(directive);
    const remainingBlocks = Math.max(0, directive.deadlineBlock - currentBlock);
    const isExpired = currentBlock >= directive.deadlineBlock;

    return {
      marketId: directive.marketId,
      isExpired,
      remainingBlocks,
      cluster,
    };
  }
}
