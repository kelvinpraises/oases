import type { ScopeFn } from "../utils.js";
import { deployFromArtifact } from "../utils.js";
import {
  dripsStreamingAbi,
  protocolAbi,
  vaultDriverAbi
} from "../../generated/abis.js";
import type { Address } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export const runWireScope: ScopeFn = async (
  publicClient,
  walletClient,
  previousScopes,
  config
) => {
  console.log("\n=== Scope 03: Wire ===");

  const streamingContracts = previousScopes.streaming?.contracts ?? {};
  const protocolContracts = previousScopes.protocol?.contracts ?? {};

  const dripsProxy = streamingContracts.dripsProxy as Address;
  const caller = streamingContracts.caller as Address;
  const protocol = protocolContracts.protocol as Address;
  const vault = protocolContracts.vault as Address;
  const marketRegistry = protocolContracts.marketRegistry as Address;
  const mockUsdc = protocolContracts.mockUsdc as Address;

  if (!dripsProxy || !caller || !protocol || !vault || !marketRegistry || !mockUsdc) {
    throw new Error("Missing prerequisite contracts from scopes 01 and 02");
  }

  // 1. Wire Protocol -> DripsStreaming
  const currentDrips = await publicClient.readContract({
    address: protocol,
    abi: protocolAbi,
    functionName: "dripsStreaming"
  });
  if (currentDrips === ZERO_ADDRESS) {
    const hash = await walletClient.writeContract({
      address: protocol,
      abi: protocolAbi,
      functionName: "setDripsStreaming",
      args: [dripsProxy]
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  Protocol.setDripsStreaming -> ${dripsProxy}`);
  }

  // 2. Wire Protocol -> MarketRegistry
  const currentRegistry = await publicClient.readContract({
    address: protocol,
    abi: protocolAbi,
    functionName: "marketRegistry"
  });
  if (currentRegistry === ZERO_ADDRESS) {
    const hash = await walletClient.writeContract({
      address: protocol,
      abi: protocolAbi,
      functionName: "setMarketRegistry",
      args: [marketRegistry]
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  Protocol.setMarketRegistry -> ${marketRegistry}`);
  }

  // 3. Wire Protocol -> Vault
  const currentVault = await publicClient.readContract({
    address: protocol,
    abi: protocolAbi,
    functionName: "vault"
  });
  if (currentVault === ZERO_ADDRESS) {
    const hash = await walletClient.writeContract({
      address: protocol,
      abi: protocolAbi,
      functionName: "setVault",
      args: [vault]
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  Protocol.setVault -> ${vault}`);
  }

  // 4. Deploy VaultDriver
  const vaultDriver = await deployFromArtifact(
    walletClient,
    publicClient,
    "VaultDriver.sol/VaultDriver.json",
    [protocol, dripsProxy, caller, mockUsdc],
    undefined,
    "vaultDriver"
  );

  // Bootstrap VaultDriver streaming if driverId == 0
  const vdId = await publicClient.readContract({
    address: vaultDriver,
    abi: vaultDriverAbi,
    functionName: "driverId"
  });
  if (vdId === 0) {
    const hash = await walletClient.writeContract({
      address: vaultDriver,
      abi: vaultDriverAbi,
      functionName: "bootstrapStreaming"
    });
    await publicClient.waitForTransactionReceipt({ hash });
    const newVdId = await publicClient.readContract({
      address: vaultDriver,
      abi: vaultDriverAbi,
      functionName: "driverId"
    });
    console.log(`  VaultDriver.bootstrapStreaming -> driverId: ${newVdId}`);
  }

  // Set Protocol -> VaultDriver
  const currentVD = await publicClient.readContract({
    address: protocol,
    abi: protocolAbi,
    functionName: "vaultDriver"
  });
  if (currentVD === ZERO_ADDRESS) {
    const hash = await walletClient.writeContract({
      address: protocol,
      abi: protocolAbi,
      functionName: "setVaultDriver",
      args: [vaultDriver]
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  Protocol.setVaultDriver -> ${vaultDriver}`);
  }

  // 5. Deploy MarketDriver
  let marketDriverProxy: Address;
  let marketDriverLogic: Address;

  const currentMD = await publicClient.readContract({
    address: protocol,
    abi: protocolAbi,
    functionName: "marketDriver"
  });

  if (currentMD !== ZERO_ADDRESS) {
    marketDriverProxy = currentMD;
    marketDriverLogic = currentMD;
  } else {
    // Reserve driver ID in Drips
    const driverId = await publicClient.readContract({
      address: dripsProxy,
      abi: dripsStreamingAbi,
      functionName: "nextDriverId"
    });

    const regHash = await walletClient.writeContract({
      address: dripsProxy,
      abi: dripsStreamingAbi,
      functionName: "registerDriver",
      args: [config.deployer]
    });
    await publicClient.waitForTransactionReceipt({ hash: regHash });
    console.log(`  Registered driver ${driverId} in Drips for deployer`);

    marketDriverLogic = await deployFromArtifact(
      walletClient,
      publicClient,
      "MarketDriver.sol/MarketDriver.json",
      [dripsProxy, caller, driverId, protocol, vault, vaultDriver, mockUsdc],
      undefined,
      "marketDriverLogic"
    );

    marketDriverProxy = await deployFromArtifact(
      walletClient,
      publicClient,
      "Managed.sol/ManagedProxy.json",
      [marketDriverLogic, config.deployer, "0x"],
      undefined,
      "marketDriverProxy"
    );

    // Hand driver address in Drips over to proxy
    const updateHash = await walletClient.writeContract({
      address: dripsProxy,
      abi: dripsStreamingAbi,
      functionName: "updateDriverAddress",
      args: [driverId, marketDriverProxy]
    });
    await publicClient.waitForTransactionReceipt({ hash: updateHash });
    console.log(`  Drips.updateDriverAddress(${driverId}) -> ${marketDriverProxy}`);

    // Set Protocol -> MarketDriver
    const setMDHash = await walletClient.writeContract({
      address: protocol,
      abi: protocolAbi,
      functionName: "setMarketDriver",
      args: [marketDriverProxy]
    });
    await publicClient.waitForTransactionReceipt({ hash: setMDHash });
    console.log(`  Protocol.setMarketDriver -> ${marketDriverProxy}`);
  }

  // 6. Wire Protocol -> Treasury
  const currentTreasury = await publicClient.readContract({
    address: protocol,
    abi: protocolAbi,
    functionName: "treasury"
  });
  if (currentTreasury === ZERO_ADDRESS) {
    const hash = await walletClient.writeContract({
      address: protocol,
      abi: protocolAbi,
      functionName: "setTreasury",
      args: [config.deployer]
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`  Protocol.setTreasury -> ${config.deployer}`);
  }

  return {
    status: "completed",
    deployedAt: new Date().toISOString(),
    contracts: {
      vaultDriver,
      marketDriverLogic,
      marketDriverProxy
    }
  };
};
