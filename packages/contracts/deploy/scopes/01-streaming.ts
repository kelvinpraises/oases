import type { ScopeFn } from "../utils.js";
import { deployFromArtifact } from "../utils.js";

export const runStreamingScope: ScopeFn = async (
  publicClient,
  walletClient,
  _previousScopes,
  config
) => {
  console.log("\n=== Scope 01: Streaming ===");

  const dripsImpl = await deployFromArtifact(
    walletClient,
    publicClient,
    "DripsStreaming.sol/DripsStreaming.json",
    [10], // 10-second cycles
    undefined,
    "dripsStreamingImpl"
  );

  const dripsProxy = await deployFromArtifact(
    walletClient,
    publicClient,
    "Managed.sol/ManagedProxy.json",
    [dripsImpl, config.deployer, "0x"],
    undefined,
    "dripsStreamingProxy"
  );

  const caller = await deployFromArtifact(
    walletClient,
    publicClient,
    "Caller.sol/Caller.json",
    [],
    undefined,
    "caller"
  );

  return {
    status: "completed",
    deployedAt: new Date().toISOString(),
    contracts: {
      dripsImpl,
      dripsProxy,
      caller
    }
  };
};
