import type { Address } from "viem";
import type { EvmContract, EvmDeployOutput, EvmDeploymentAddresses } from "./types.js";

const CONTRACT_FROM_DEPLOY_KEY: Readonly<Record<string, EvmContract>> = {
  protocol: "protocol",
  marketRegistry: "marketRegistry",
  vault: "vault",
  dripsProxy: "dripsStreaming",
  caller: "caller",
  marketDriverProxy: "marketDriver",
  vaultDriver: "vaultDriver",
  mockUsdc: "mockUsdc"
};

export function flattenDeploymentScopes(output: EvmDeployOutput): EvmDeploymentAddresses {
  const flat: Record<string, Address> = {
    ...(output.scopes.streaming?.contracts ?? {}),
    ...(output.scopes.protocol?.contracts ?? {}),
    ...(output.scopes.wire?.contracts ?? {})
  };

  const mapped: EvmDeploymentAddresses = {};
  for (const [deployKey, address] of Object.entries(flat)) {
    const contract = CONTRACT_FROM_DEPLOY_KEY[deployKey];
    if (contract !== undefined) {
      mapped[contract] = address;
    }
  }
  return mapped;
}
