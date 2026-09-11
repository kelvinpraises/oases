import { z } from "zod";

export const HarbingerConfigSchema = z.object({
  rpcUrl: z.string().url().default("http://127.0.0.1:8545"),
  subgraphUrl: z
    .string()
    .url()
    .default("http://127.0.0.1:8000/subgraphs/name/messari/aave-v3"),
  chainId: z.coerce.number().default(31337),
  operatorPrivateKey: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "Must be a 32-byte hex private key")
    .optional(),
  marketRegistryAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional(),
  vaultDriverAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address")
    .optional(),
  dbPath: z.string().default(".data/harbinger.db"),
  wsPort: z.coerce.number().default(4001),
  macroCadenceMs: z.coerce.number().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type HarbingerConfig = z.infer<typeof HarbingerConfigSchema>;

export function loadConfig(
  overrides: Partial<HarbingerConfig> = {},
): HarbingerConfig {
  const envConfig: Record<string, unknown> = {};
  if (process.env.HARBINGER_RPC_URL !== undefined) envConfig.rpcUrl = process.env.HARBINGER_RPC_URL;
  if (process.env.HARBINGER_SUBGRAPH_URL !== undefined) envConfig.subgraphUrl = process.env.HARBINGER_SUBGRAPH_URL;
  if (process.env.HARBINGER_CHAIN_ID !== undefined) envConfig.chainId = process.env.HARBINGER_CHAIN_ID;
  if (process.env.HARBINGER_PRIVATE_KEY !== undefined) envConfig.operatorPrivateKey = process.env.HARBINGER_PRIVATE_KEY;
  if (process.env.HARBINGER_MARKET_REGISTRY !== undefined) envConfig.marketRegistryAddress = process.env.HARBINGER_MARKET_REGISTRY;
  if (process.env.HARBINGER_VAULT_DRIVER !== undefined) envConfig.vaultDriverAddress = process.env.HARBINGER_VAULT_DRIVER;
  if (process.env.HARBINGER_DB_PATH !== undefined) envConfig.dbPath = process.env.HARBINGER_DB_PATH;
  if (process.env.HARBINGER_WS_PORT !== undefined) envConfig.wsPort = process.env.HARBINGER_WS_PORT;
  if (process.env.HARBINGER_MACRO_CADENCE_MS !== undefined) envConfig.macroCadenceMs = process.env.HARBINGER_MACRO_CADENCE_MS;
  if (process.env.HARBINGER_LOG_LEVEL !== undefined) envConfig.logLevel = process.env.HARBINGER_LOG_LEVEL;

  return HarbingerConfigSchema.parse({
    ...envConfig,
    ...overrides,
  });
}
