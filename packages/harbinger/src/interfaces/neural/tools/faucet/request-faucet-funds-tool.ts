import { createTool } from "@mastra/core/tools";
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
  const tool = createTool({
    id: "requestFaucetFunds",
    description: "Requests Mock USDC seeding capital ($20) or native testnet gas (HBAR) from the dual-rail Faucet service to fund the agent's EOA.",
    inputSchema: RequestFaucetFundsInputSchema,
    execute: async (args: any) => {
      const input = (args && typeof args === "object" && "context" in args && args.context) ? args.context : args;
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
  });

  const origExec = tool.execute?.bind(tool);
  const wrapped = {
    ...tool,
    execute: async (inputData?: any, context?: any) => {
      if (!origExec) return undefined;
      const res = await origExec(inputData, context);
      if (res && typeof res === "object" && "error" in res && (res as any).error) {
        throw new Error((res as any).message);
      }
      return res;
    },
  };
  return wrapped as typeof tool & { execute: (inputData?: any, context?: any) => Promise<any> };
}
