import { parseArgs } from "node:util";
import { parseEther, type Hex, type Address } from "viem";
import { defaultChains } from "./chains.js";
import {
  createClients,
  ensureNickFactory,
  readState,
  writeState,
  promoteDeployment,
  type DeployState,
  type ScopeResult
} from "./utils.js";
import { runStreamingScope } from "./scopes/01-streaming.js";
import { runProtocolScope } from "./scopes/02-protocol.js";
import { runWireScope } from "./scopes/03-wire.js";

const DEFAULT_ANVIL_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string", short: "n", default: "localhost" },
      rpc: { type: "string" },
      scope: { type: "string", short: "s" },
      force: { type: "boolean", short: "f", default: false },
      all: { type: "boolean", short: "a", default: false },
      help: { type: "boolean", short: "h", default: false }
    }
  });

  if (values.help) {
    console.log(`
Oases EVM Deploy Pipeline
Usage: npm run deploy -- [options]

Options:
  --name, -n <chain>   Chain name (default: "localhost")
  --rpc <url>          RPC URL override
  --scope, -s <name>   Execute only a specific scope ("streaming", "protocol", "wire")
  --force, -f          Re-run scopes even if previously completed
  --help, -h           Show this help message
`);
    process.exit(0);
  }

  const chainName = values.name ?? "localhost";
  const chainConfig = defaultChains[chainName];
  if (!chainConfig && !values.rpc) {
    throw new Error(`Unknown chain "${chainName}" and no --rpc URL provided`);
  }

  const rpc = values.rpc ?? chainConfig?.rpc ?? "http://127.0.0.1:8545";
  const chainId = chainConfig?.chainId ?? 31337;
  const deployerKey = (process.env.DEPLOYER_PRIVATE_KEY as Hex) ?? DEFAULT_ANVIL_KEY;

  console.log(`\n========================================`);
  console.log(`  Oases Deployer: ${chainName} (Chain ID: ${chainId})`);
  console.log(`  RPC: ${rpc}`);
  console.log(`========================================\n`);

  const { publicClient, walletClient, account } = createClients(rpc, deployerKey);
  const deployerAddress = account.address;
  console.log(`Deployer address: ${deployerAddress}`);

  // Local Anvil auto-fund check
  if (chainId === 31337) {
    const balance = await publicClient.getBalance({ address: deployerAddress });
    if (balance < parseEther("1")) {
      try {
        await publicClient.request({
          method: "anvil_setBalance",
          params: [deployerAddress, "0x8AC7230489E80000"] // 10 ETH
        } as never);
        console.log("  Auto-funded local deployer with 10 ETH");
      } catch {
        // Not anvil or not supported
      }
    }
  }

  // Ensure Nick's factory is present
  await ensureNickFactory(publicClient, walletClient);

  // Load or initialize state
  let state: DeployState = readState(chainName) ?? {
    chain: chainName,
    chainId,
    rpc,
    deployedAt: new Date().toISOString(),
    deployer: deployerAddress,
    scopes: {}
  };

  const SCOPES = [
    { name: "streaming", fn: runStreamingScope },
    { name: "protocol", fn: runProtocolScope },
    { name: "wire", fn: runWireScope }
  ];

  const targetScope = values.scope;

  for (const { name, fn } of SCOPES) {
    if (targetScope && targetScope !== name) {
      continue;
    }

    if (!values.force && state.scopes[name]?.status === "completed") {
      console.log(`\nScope [${name}] already completed. Skipping (use --force to re-run).`);
      continue;
    }

    try {
      const result: ScopeResult = await fn(publicClient, walletClient, state.scopes, {
        chain: chainName,
        rpc,
        deployer: deployerAddress
      });

      state = {
        ...state,
        deployedAt: new Date().toISOString(),
        scopes: {
          ...state.scopes,
          [name]: result
        }
      };

      writeState(chainName, state);
    } catch (error) {
      console.error(`\nScope [${name}] failed:`, error);
      state = {
        ...state,
        scopes: {
          ...state.scopes,
          [name]: {
            status: "failed",
            error: error instanceof Error ? error.message : String(error)
          }
        }
      };
      writeState(chainName, state);
      process.exit(1);
    }
  }

  console.log("\nPromoting deployment snapshots...");
  promoteDeployment(chainName);

  console.log(`\n========================================`);
  console.log(`  Deployment pipeline completed successfully!`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error("Fatal deployment error:", err);
  process.exit(1);
});
