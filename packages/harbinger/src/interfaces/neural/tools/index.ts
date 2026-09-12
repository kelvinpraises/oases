import type { JournalService } from "../../../services/journal/journal-service";
import type { LoopService } from "../../../services/loop/loop-service";
import type { GraphClient } from "../../../services/graph/graph-client";

import { createLogThoughtTool } from "./journal/index";
import {
  createUpdateCadenceTool,
  createSpawnJobTool,
  createKillJobTool,
  createListJobsTool,
} from "./orchestration/index";
import {
  createQuerySubgraphTool,
  createEvaluateMetricTool,
} from "./observation/index";
import {
  createCheckPrecedenceTool,
  createCreateTicketTool,
} from "./resolution/index";

export * from "./journal/index";
export * from "./orchestration/index";
export * from "./observation/index";
export * from "./resolution/index";
export * from "./faucet/index";

export function wrapMastraTool<T extends { id?: string; description?: string; execute?: (...args: any[]) => Promise<any> }>(
  tool: T
): T & { execute: (inputData?: any, context?: any) => Promise<any> } {
  const origExec = tool.execute?.bind(tool);
  const wrapped = {
    ...tool,
    execute: async (inputData?: any, context?: any) => {
      if (!origExec) return undefined;
      const res = await origExec(inputData, context);
      if (res && typeof res === "object" && "error" in res && (res as any).error) {
        throw new Error((res as any).message);
      }
      return res;
    },
  };
  return wrapped as any;
}

export function createNeuralTools(services: {
  journalService: JournalService;
  loopService: LoopService;
  graphClient: GraphClient;
}) {
  return {
    logThought: wrapMastraTool(createLogThoughtTool(services.journalService)),
    updateCadence: wrapMastraTool(createUpdateCadenceTool(services.loopService)),
    spawnJob: wrapMastraTool(createSpawnJobTool(services.loopService)),
    killJob: wrapMastraTool(createKillJobTool(services.loopService)),
    listJobs: wrapMastraTool(createListJobsTool(services.loopService)),
    querySubgraph: wrapMastraTool(createQuerySubgraphTool(services.graphClient)),
    evaluateMetric: wrapMastraTool(createEvaluateMetricTool(services.graphClient)),
    checkPrecedence: wrapMastraTool(createCheckPrecedenceTool()),
    dryRunTicket: wrapMastraTool(createCreateTicketTool()),
  };
}

