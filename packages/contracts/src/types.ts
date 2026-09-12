import type { Address } from "viem";

export type EvmContract =
  | "protocol"
  | "marketRegistry"
  | "agentRegistry"
  | "vault"
  | "dripsStreaming"
  | "caller"
  | "marketDriver"
  | "vaultDriver"
  | "mockUsdc";

export type DeploymentName = "localhost";

export type EvmDeployScope = {
  readonly status: string;
  readonly deployedAt?: string;
  readonly contracts?: Readonly<Record<string, Address>>;
};

export type EvmDeployOutput = {
  readonly chain: string;
  readonly chainId: number;
  readonly rpc: string;
  readonly deployedAt?: string;
  readonly deployer?: Address;
  readonly scopes: Readonly<Record<string, EvmDeployScope>>;
};

export type EvmDeploymentAddresses = Partial<Record<EvmContract, Address>>;
export type EvmAddresses = Record<DeploymentName, EvmDeploymentAddresses>;
