import { Command } from "commander";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bootHarbingerDaemon,
  getActiveHarness,
  runMcpStdioServer,
  faucetService,
  type SourceDirective,
} from "@oases/harbinger";
import type { Address } from "viem";

export function registerHarbingerCommand(program: Command): void {
  const harbinger = program
    .command("harbinger")
    .description("Harbinger Autonomous Oracle & Conviction Streaming Harness");

  harbinger
    .command("start")
    .description("Start the Harbinger autonomous daemon harness")
    .option("-p, --port <number>", "WebSocket broadcast port", "4001")
    .option(
      "-d, --db <path>",
      "Path to host SQLite database",
      ".data/harbinger.db",
    )
    .option("-a, --agent-id <id>", "Select active agent from manifest")
    .action(async (options: { port: string; db: string; agentId?: string }) => {
      console.log("🦅 Starting Harbinger Agentic Harness...");
      const harness = await bootHarbingerDaemon(
        {
          wsPort: Number(options.port),
          dbPath: options.db,
        },
        undefined,
        options.agentId,
      );
      console.log(
        `✅ Harbinger active on chain ${harness.config.chainId}. WS broadcast on :${options.port}${harness.agentConfig ? ` (Agent: ${harness.agentConfig.name}, Driver: ${harness.agentConfig.driver})` : ""}`,
      );
    });

  harbinger
    .command("mcp")
    .description("Start Harbinger MCP Server over stdio (Driver B)")
    .action(async () => {
      await runMcpStdioServer();
    });

  harbinger
    .command("faucet")
    .description("Dispense Mock USDC and native testnet tokens")
    .argument("<evmAddress>", "Recipient EVM address")
    .option("-a, --account <id>", "Recipient Hedera account ID")
    .option("-u, --usdc <amount>", "Mock USDC amount", "100")
    .action(async (evmAddress: string, options: { account?: string; usdc: string }) => {
      const usdcRaw = BigInt(Math.round(Number(options.usdc) * 1e6));
      console.log(`💧 Dispensing testnet funds to ${evmAddress}...`);
      const receipt = await faucetService.dispenseFunds({
        evmAddress: evmAddress as Address,
        hederaAccountId: options.account,
        mockUsdcAmount: usdcRaw,
      });
      console.log(`✅ Dispensed $${options.usdc} Mock USDC and 1 HBAR. Timestamp: ${receipt.timestamp}`);
    });

  harbinger
    .command("status")
    .description("Query health and active monitoring jobs")
    .action(async () => {
      const harness = getActiveHarness();
      if (!harness) {
        console.log("❌ Harbinger daemon is not running in this process.");
        return;
      }
      const jobs = await harness.loopService.listJobs();
      const thoughts = await harness.journalService.getRecentThoughts(5);
      console.log(
        `📊 Harbinger Status: READY (Jobs: ${jobs.length}, WS Clients: ${harness.wsServer.getConnectedClientCount()})`,
      );
      console.log("Recent thoughts:");
      for (const t of thoughts) {
        console.log(`  [${t.level}] ${t.thought}`);
      }
    });

  harbinger
    .command("prime")
    .description(
      "Prime Genesis for an open set of N child vaults under a Tension Cast",
    )
    .argument("<directivePath>", "Path to directive JSON manifest")
    .action(async (directivePath: string) => {
      const harness = getActiveHarness() ?? (await bootHarbingerDaemon());
      const fullPath = resolve(process.cwd(), directivePath);
      const raw = readFileSync(fullPath, "utf-8");
      const directive = JSON.parse(raw) as SourceDirective;

      console.log(
        `🌱 Priming Tension Cast: ${directive.title} (${directive.childVaults.length} vaults)...`,
      );
      const result =
        await harness.tensionCastService.primeTensionCast(directive);
      console.log(
        `✅ Primed ${result.primedVaults.length} vaults. Total Seed Capital: ${result.totalSeedCapital.toString()} Wad.`,
      );
    });
}
