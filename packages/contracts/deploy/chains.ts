export interface ChainConfig {
  name: string;
  chainId: number;
  rpc: string;
}

export const defaultChains: Record<string, ChainConfig> = {
  localhost: {
    name: "localhost",
    chainId: 31337,
    rpc: process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545"
  },
  "hedera-testnet": {
    name: "hedera-testnet",
    chainId: 296,
    rpc: process.env.HEDERA_RPC_URL ?? "https://testnet.hashio.io/api"
  }
};
