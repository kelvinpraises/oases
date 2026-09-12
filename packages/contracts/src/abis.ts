import {
  agentRegistryAbi,
  callerAbi,
  dripsStreamingAbi,
  iDripsAbi,
  marketDriverAbi,
  marketRegistryAbi,
  mockUsdcAbi,
  protocolAbi,
  vaultAbi,
  vaultDriverAbi
} from "../generated/abis.js";

import type { EvmContract } from "./types.js";

const assertEvmAbiCoverage = <T extends { readonly [K in EvmContract]: unknown }>(map: T) => map;

export const evmAbis = assertEvmAbiCoverage({
  protocol: protocolAbi,
  marketRegistry: marketRegistryAbi,
  agentRegistry: agentRegistryAbi,
  vault: vaultAbi,
  dripsStreaming: dripsStreamingAbi,
  caller: callerAbi,
  marketDriver: marketDriverAbi,
  vaultDriver: vaultDriverAbi,
  mockUsdc: mockUsdcAbi
});

export {
  agentRegistryAbi,
  callerAbi,
  dripsStreamingAbi,
  iDripsAbi,
  marketDriverAbi,
  marketRegistryAbi,
  mockUsdcAbi,
  protocolAbi,
  vaultAbi,
  vaultDriverAbi
};

export const abis = evmAbis;
export type EvmContractAbi<N extends EvmContract> = (typeof evmAbis)[N];
