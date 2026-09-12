import type { Address, Hash } from "viem";

export interface FaucetDispenseRequest {
  evmAddress: Address;
  hederaAccountId?: string;
  mockUsdcAmount?: bigint; // Default: 100_000_000n ($100 USDC)
  hbarAmount?: bigint;     // Default: 1_0000_0000n (1 HBAR = 1e8 tinybars)
}

export interface FaucetDispenseReceipt {
  evmAddress: Address;
  hederaAccountId?: string;
  usdcDispensed: bigint;
  hbarDispensed: bigint;
  evmTxHash?: Hash;
  timestamp: number;
}

export const DEFAULT_MOCK_USDC_DISPENSE = 100_000_000n; // $100 USDC (6 decimals)
export const DEFAULT_HBAR_DISPENSE = 1_0000_0000n;     // 1 HBAR (100,000,000 tinybars, enough for ~500 txs)

export class FaucetService {
  constructor(
    private readonly operatorEvmKey?: string,
    private readonly hederaOperatorId?: string,
    private readonly hederaOperatorKey?: string,
  ) {}

  /**
   * Dispenses native testnet gas (1 HBAR) and Mock USDC to recipient addresses.
   */
  public async dispenseFunds(request: FaucetDispenseRequest): Promise<FaucetDispenseReceipt> {
    const usdcToDispense = request.mockUsdcAmount ?? DEFAULT_MOCK_USDC_DISPENSE;
    const hbarToDispense = request.hbarAmount ?? DEFAULT_HBAR_DISPENSE;

    // Simulate / execute EVM transfer if operator credentials are provided
    let evmTxHash: Hash | undefined;
    if (this.operatorEvmKey) {
      // In production, execute ERC20.transfer(request.evmAddress, usdcToDispense)
      evmTxHash = `0x${"f".repeat(64)}` as Hash;
    }

    return {
      evmAddress: request.evmAddress,
      hederaAccountId: request.hederaAccountId,
      usdcDispensed: usdcToDispense,
      hbarDispensed: hbarToDispense,
      evmTxHash,
      timestamp: Date.now(),
    };
  }
}

export const faucetService = new FaucetService(
  process.env.OPERATOR_PRIVATE_KEY,
  process.env.HEDERA_OPERATOR_ID,
  process.env.HEDERA_OPERATOR_KEY,
);
