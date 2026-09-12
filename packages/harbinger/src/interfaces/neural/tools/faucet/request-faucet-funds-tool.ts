import { z } from "zod";
import { FaucetService, faucetService as defaultFaucetService } from "../../../../services/faucet/faucet-service";
import type { Address } from "viem";

export const RequestFaucetFundsInputSchema = z.object({
  evmAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  hederaAccountId: z.string().optional(),
  purpose: z.enum(["SEEDING_CAPITAL", "GAS_REPLENISHMENT", "OPERATIONAL"]).default("SEEDING_CAPITAL"),
  usdcAmount: z.number().positive().default(20), // Default: $20 USDC for child vault priming
});

export type RequestFaucetFundsInput = z.infer<typeof RequestFaucetFundsInputSchema>;

export function createRequestFaucetFundsTool(faucet: FaucetService = defaultFaucetService) {
  return {
    id: "requestFaucetFunds",
    description: "Requests Mock USDC seeding capital ($20) or native testnet gas (HBAR) from the dual-rail Faucet service to fund the agent's EOA.",
    inputSchema: RequestFaucetFundsInputSchema,
    execute: async (input: RequestFaucetFundsInput) => {
      const validated = RequestFaucetFundsInputSchema.parse(input);
      const usdcRaw = BigInt(Math.round(validated.usdcAmount * 1e6));

      const receipt = await faucet.dispenseFunds({
        evmAddress: validated.evmAddress as Address,
        hederaAccountId: validated.hederaAccountId,
        mockUsdcAmount: usdcRaw,
      });

      return {
        success: true,
        evmAddress: receipt.evmAddress,
        usdcDispensed: receipt.usdcDispensed.toString(),
        hbarDispensed: receipt.hbarDispensed.toString(),
        purpose: validated.purpose,
      };
    },
  };
}
