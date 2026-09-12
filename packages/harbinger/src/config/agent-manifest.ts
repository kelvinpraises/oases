import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const AgentConfigSchema = z.object({
  id: z.string().min(1, "Agent ID cannot be empty"),
  name: z.string().min(1, "Agent name cannot be empty"),
  role: z.string().min(1, "Agent role cannot be empty"),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM address"),
  privateKeyEnv: z.string().min(1, "Private key env variable name required"),
  hcsInboxTopicId: z.string().regex(/^\d+\.\d+\.\d+$/, "Invalid HCS inbox topic ID (e.g. 0.0.12345)"),
  hcsRegistryTopicId: z.string().regex(/^\d+\.\d+\.\d+$/, "Invalid HCS registry topic ID (e.g. 0.0.12345)"),
  driver: z.enum(["mastra", "mcp"]),
  activeDirectives: z.array(z.string()).default([]),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentManifestSchema = z.object({
  agents: z.array(AgentConfigSchema).min(1, "Manifest must declare at least one agent"),
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;

/**
 * Loads and validates the authoritative agent manifest from oases-agents.json.
 */
export function loadAgentManifest(filePath?: string): AgentManifest {
  let targetPath =
    filePath ??
    process.env.OASES_AGENTS_MANIFEST_PATH ??
    resolve(process.cwd(), "oases-agents.json");

  if (!existsSync(targetPath)) {
    const parentPath = resolve(process.cwd(), "..", "oases-agents.json");
    const grandParentPath = resolve(process.cwd(), "../..", "oases-agents.json");
    if (existsSync(parentPath)) {
      targetPath = parentPath;
    } else if (existsSync(grandParentPath)) {
      targetPath = grandParentPath;
    } else {
      throw new Error(
        `AgentManifestNotFound: Could not find agent manifest at "${targetPath}". Ensure oases-agents.json exists at root.`,
      );
    }
  }

  const raw = readFileSync(targetPath, "utf-8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`AgentManifestParseError: Failed to parse JSON in "${targetPath}": ${String(err)}`);
  }

  return AgentManifestSchema.parse(json);
}

/**
 * Retrieves the specified active agent from the manifest, or defaults to the first agent.
 */
export function getActiveAgent(manifest: AgentManifest, agentId?: string): AgentConfig {
  if (agentId) {
    const found = manifest.agents.find((a) => a.id === agentId);
    if (!found) {
      throw new Error(
        `AgentNotFound: Agent with ID "${agentId}" not found in manifest. Available agents: ${manifest.agents.map((a) => a.id).join(", ")}`,
      );
    }
    return found;
  }
  return manifest.agents[0];
}
