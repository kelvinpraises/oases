import { flattenDeploymentScopes } from "./flatten-deployment.js";
import type { DeploymentName, EvmAddresses, EvmDeployOutput, EvmDeploymentAddresses } from "./types.js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const deploymentsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "deployments"
);

const KNOWN_DEPLOYMENTS = ["localhost"] as const satisfies readonly DeploymentName[];

export const readDeploymentOutputFromPath = (path: string): EvmDeployOutput => {
  if (!existsSync(path)) {
    throw new Error(`Missing EVM deployment snapshot ${path}. Run: npm run deploy`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as EvmDeployOutput;
  } catch (error) {
    throw new Error(
      `Unparseable EVM deployment snapshot ${path} (${error instanceof Error ? error.message : String(error)}). Re-run: npm run deploy`
    );
  }
};

const readDeploymentFile = (name: string): EvmDeployOutput => {
  const path = join(deploymentsDir, `${name}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing EVM deployment snapshot ${path}. Run: npm run deploy -- --name ${name}`);
  }
  return readDeploymentOutputFromPath(path);
};

export const loadDeploymentOutput = (name: DeploymentName = "localhost"): EvmDeployOutput =>
  readDeploymentFile(name);

export const getContractAddresses = (name: DeploymentName = "localhost"): EvmDeploymentAddresses =>
  flattenDeploymentScopes(readDeploymentFile(name));

export const localhostDeploymentPath = (): string => join(deploymentsDir, "localhost.json");

const discoverDeployments = (): DeploymentName[] => {
  if (!existsSync(deploymentsDir)) return [...KNOWN_DEPLOYMENTS];
  const fromDisk = readdirSync(deploymentsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .filter((name): name is DeploymentName => (KNOWN_DEPLOYMENTS as readonly string[]).includes(name as DeploymentName));
  return fromDisk.length > 0 ? fromDisk : [...KNOWN_DEPLOYMENTS];
};

const buildAddresses = (): EvmAddresses => {
  const result = {} as EvmAddresses;
  for (const name of discoverDeployments()) {
    let cached: EvmDeploymentAddresses | undefined;
    Object.defineProperty(result, name, {
      enumerable: true,
      get: (): EvmDeploymentAddresses => {
        cached ??= flattenDeploymentScopes(readDeploymentFile(name));
        return cached;
      }
    });
  }
  return result;
};

export const addresses: EvmAddresses = buildAddresses();
