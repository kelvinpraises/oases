import type { ScopeFn } from "../utils.js";
import { deployFromArtifact } from "../utils.js";
import { parseUnits } from "viem";
import { mockUsdcAbi } from "../../generated/abis.js";

export const runProtocolScope: ScopeFn = async (
  publicClient,
  walletClient,
  _previousScopes,
  config
) => {
  console.log("\n=== Scope 02: Protocol ===");

  const protocol = await deployFromArtifact(
    walletClient,
    publicClient,
    "Protocol.sol/Protocol.json",
    [config.deployer],
    undefined,
    "protocol"
  );

  const marketRegistry = await deployFromArtifact(
    walletClient,
    publicClient,
    "MarketRegistry.sol/MarketRegistry.json",
    [config.deployer, protocol],
    undefined,
    "marketRegistry"
  );

  const agentRegistry = await deployFromArtifact(
    walletClient,
    publicClient,
    "AgentRegistry.sol/AgentRegistry.json",
    [config.deployer],
    undefined,
    "agentRegistry"
  );

  const mockUsdc = await deployFromArtifact(
    walletClient,
    publicClient,
    "MockUSDC.sol/MockUSDC.json",
    [],
    undefined,
    "mockUsdc"
  );

  // Mint 1,000,000 USDC (6 decimals) to deployer if balance is below 10,000 USDC
  const mintHash = await walletClient.writeContract({
    address: mockUsdc,
    abi: mockUsdcAbi,
    functionName: "mint",
    args: [config.deployer, parseUnits("1000000", 6)]
  });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log(`  Minted 1,000,000 MockUSDC to ${config.deployer}`);

  const vault = await deployFromArtifact(
    walletClient,
    publicClient,
    "Vault.sol/Vault.json",
    [protocol, mockUsdc],
    undefined,
    "vault"
  );

  return {
    status: "completed",
    deployedAt: new Date().toISOString(),
    contracts: {
      protocol,
      marketRegistry,
      agentRegistry,
      vault,
      mockUsdc
    }
  };
};
