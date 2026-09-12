import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "generated/abis.ts",
  plugins: [
    foundry({
      project: ".",
      include: [
        "Protocol.sol/Protocol.json",
        "MarketRegistry.sol/MarketRegistry.json",
        "AgentRegistry.sol/AgentRegistry.json",
        "Vault.sol/Vault.json",
        "DripsStreaming.sol/DripsStreaming.json",
        "IDrips.sol/IDrips.json",
        "Caller.sol/Caller.json",
        "MarketDriver.sol/MarketDriver.json",
        "VaultDriver.sol/VaultDriver.json",
        "MockUSDC.sol/MockUSDC.json"
      ]
    })
  ]
});
