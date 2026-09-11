import type { Job } from "../../models/Job";

export interface SpawnJobParams {
  job: Job;
  solverConfig: string;
  queryBody: string;
}
