import type { ChainClientService } from "../chain/client-service";
import type { JournalService } from "../journal/journal-service";
import type { Hash } from "viem";

export const DEFAULT_PITCH_FEE = 5_000_000n; // $5.00 USDC (6 decimals)
export const MARKET_YIELD_BPS = 8000n; // 80% ($4.00)
export const AGENT_GAS_BPS = 2000n; // 20% ($1.00)

export interface YieldSplitResult {
  marketId: string;
  totalFee: bigint;
  marketYieldAmount: bigint;
  agentGasAmount: bigint;
  txHash?: Hash;
  timestamp: number;
}

export function calculateYieldSplit(totalFee: bigint = DEFAULT_PITCH_FEE): {
  marketYieldAmount: bigint;
  agentGasAmount: bigint;
} {
  const marketYieldAmount = (totalFee * MARKET_YIELD_BPS) / 10_000n;
  const agentGasAmount = totalFee - marketYieldAmount;
  return { marketYieldAmount, agentGasAmount };
}

export class YieldSplitter {
  private accumulatedAgentGas = 0n;

  constructor(
    private chainClient?: ChainClientService,
    private journalService?: JournalService,
  ) {}

  /**
   * Processes an incoming pitch fee under the 80/20 protocol rule:
   * - 80% ($4.00) is injected into Vault.injectMarketYield() on EVM.
   * - 20% ($1.00) is credited to the agent's gas treasury.
   * Protocol Invariant: Zero refunds regardless of whether the pitch thesis is accepted or rejected.
   */
  public async processPitchYield(
    marketId: string,
    feeAmount: bigint = DEFAULT_PITCH_FEE,
  ): Promise<YieldSplitResult> {
    const { marketYieldAmount, agentGasAmount } = calculateYieldSplit(feeAmount);

    let txHash: Hash | undefined;
    if (this.chainClient) {
      txHash = await this.chainClient.injectMarketYield(marketId, marketYieldAmount);
    }

    this.accumulatedAgentGas += agentGasAmount;

    if (this.journalService) {
      await this.journalService.recordThought({
        level: "INFO",
        type: "YIELD_INJECTION",
        source: "yield_splitter",
        thought: `Executed 80/20 pitch yield split on market ${marketId}: $${(Number(marketYieldAmount) / 1e6).toFixed(2)} injected into pot, $${(Number(agentGasAmount) / 1e6).toFixed(2)} retained for EOA gas. Total agent gas treasury: $${(Number(this.accumulatedAgentGas) / 1e6).toFixed(2)}.`,
        confidenceScore: 1.0,
        metadata: {
          marketId,
          totalFee: feeAmount.toString(),
          marketYieldAmount: marketYieldAmount.toString(),
          agentGasAmount: agentGasAmount.toString(),
          txHash,
        },
      });
    }

    return {
      marketId,
      totalFee: feeAmount,
      marketYieldAmount,
      agentGasAmount,
      txHash,
      timestamp: Date.now(),
    };
  }

  public getAccumulatedAgentGas(): bigint {
    return this.accumulatedAgentGas;
  }
}
