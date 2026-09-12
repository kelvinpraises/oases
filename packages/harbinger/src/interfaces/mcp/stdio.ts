import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHarbingerMcpServer, type McpServerServices } from "./server";
import { loadConfig } from "../../config";
import { getDatabase } from "../../infrastructure/database/connection";
import { JournalService } from "../../services/journal/journal-service";
import { LoopService } from "../../services/loop/loop-service";
import { CronScheduler } from "../../infrastructure/cron/scheduler";
import { LoopRunner } from "../../infrastructure/cron/loop-runner";
import { FreshnessService } from "../../services/graph/freshness-service";
import { GraphClient } from "../../services/graph/graph-client";
import { faucetService } from "../../services/faucet/faucet-service";

export async function runMcpStdioServer(customServices?: McpServerServices): Promise<void> {
  let services = customServices;

  if (!services) {
    const config = loadConfig();
    const db = getDatabase(config.dbPath);
    const journalService = new JournalService(db);
    const scheduler = new CronScheduler();
    const graphClient = new GraphClient(config.subgraphUrl);
    const freshnessService = new FreshnessService();
    const loopRunner = new LoopRunner(db, graphClient, freshnessService, journalService, scheduler);
    const loopService = new LoopService(db, scheduler, loopRunner, journalService);

    services = {
      journalService,
      loopService,
      graphClient,
      faucetService,
    };
  }

  const server = createHarbingerMcpServer(services);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  process.stderr.write("[Harbinger MCP] Sovereign Sentinel MCP server listening over stdio.\n");
}

// Direct execution entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpStdioServer().catch((err) => {
    process.stderr.write(`[Harbinger MCP Error] ${String(err)}\n`);
    process.exit(1);
  });
}
