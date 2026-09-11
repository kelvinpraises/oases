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

export function createNeuralTools(services: {
  journalService: JournalService;
  loopService: LoopService;
  graphClient: GraphClient;
}) {
  return {
    logThought: createLogThoughtTool(services.journalService),
    updateCadence: createUpdateCadenceTool(services.loopService),
    spawnJob: createSpawnJobTool(services.loopService),
    killJob: createKillJobTool(services.loopService),
    listJobs: createListJobsTool(services.loopService),
    querySubgraph: createQuerySubgraphTool(services.graphClient),
    evaluateMetric: createEvaluateMetricTool(services.graphClient),
    checkPrecedence: createCheckPrecedenceTool(),
    dryRunTicket: createCreateTicketTool(),
  };
}
