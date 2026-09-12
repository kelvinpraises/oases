import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JournalService } from "../../services/journal/journal-service";
import type { LoopService } from "../../services/loop/loop-service";
import type { GraphClient } from "../../services/graph/graph-client";
import { FaucetService, faucetService as defaultFaucetService } from "../../services/faucet/faucet-service";

import { createLogThoughtTool, LogThoughtInputSchema } from "../neural/tools/journal/index";
import {
  createUpdateCadenceTool,
  createSpawnJobTool,
  createKillJobTool,
  createListJobsTool,
  UpdateCadenceInputSchema,
  SpawnJobInputSchema,
  KillJobInputSchema,
} from "../neural/tools/orchestration/index";
import {
  createQuerySubgraphTool,
  createEvaluateMetricTool,
  QuerySubgraphInputSchema,
  EvaluateMetricInputSchema,
} from "../neural/tools/observation/index";
import {
  createRequestFaucetFundsTool,
  RequestFaucetFundsInputSchema,
} from "../neural/tools/faucet/index";

export interface McpServerServices {
  journalService: JournalService;
  loopService: LoopService;
  graphClient: GraphClient;
  faucetService?: FaucetService;
}

/**
 * Instantiates the Harbinger MCP Server (Driver B).
 * Exposes observation, orchestration, and autonomous faucet tools over MCP.
 * Enforces Axiom 4.1 Air-Gap: Never exposes resolveVault or settlement mutation tools.
 */
export function createHarbingerMcpServer(services: McpServerServices): McpServer {
  const server = new McpServer({
    name: "oases-harbinger-sentinel",
    version: "0.1.0",
  });

  const logThoughtTool = createLogThoughtTool(services.journalService);
  const updateCadenceTool = createUpdateCadenceTool(services.loopService);
  const spawnJobTool = createSpawnJobTool(services.loopService);
  const killJobTool = createKillJobTool(services.loopService);
  const listJobsTool = createListJobsTool(services.loopService);
  const querySubgraphTool = createQuerySubgraphTool(services.graphClient);
  const evaluateMetricTool = createEvaluateMetricTool(services.graphClient);
  const faucetTool = createRequestFaucetFundsTool(services.faucetService ?? defaultFaucetService);

  server.tool(
    "logThought",
    logThoughtTool.description,
    LogThoughtInputSchema.shape,
    async (args) => {
      const res = await (logThoughtTool as any).execute(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "updateCadence",
    updateCadenceTool.description,
    UpdateCadenceInputSchema.shape,
    async (args) => {
      const res = await (updateCadenceTool as any).execute(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "spawnJob",
    spawnJobTool.description,
    SpawnJobInputSchema.shape,
    async (args) => {
      const res = await (spawnJobTool as any).execute(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "killJob",
    killJobTool.description,
    KillJobInputSchema.shape,
    async (args) => {
      const res = await (killJobTool as any).execute(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "listJobs",
    listJobsTool.description,
    {},
    async () => {
      const res = await (listJobsTool as any).execute();
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "querySubgraph",
    querySubgraphTool.description,
    QuerySubgraphInputSchema.shape,
    async (args) => {
      const res = await (querySubgraphTool as any).execute(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "evaluateMetric",
    evaluateMetricTool.description,
    EvaluateMetricInputSchema.shape,
    async (args) => {
      const res = await (evaluateMetricTool as any).execute(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  server.tool(
    "requestFaucetFunds",
    faucetTool.description,
    RequestFaucetFundsInputSchema.shape,
    async (args) => {
      const res = await (faucetTool as any).execute(args);
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    },
  );

  return server;
}
