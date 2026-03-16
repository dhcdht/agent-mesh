import { readFileSync } from "node:fs";
import YAML from "yaml";
import { nodeConfigSchema, type NodeConfig } from "./types.js";

function resolveEnvPlaceholders(content: string): string {
  return content.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key: string) => process.env[key] ?? "");
}

export function loadNodeConfig(configPath: string): NodeConfig {
  const raw = readFileSync(configPath, "utf-8");
  const resolvedRaw = resolveEnvPlaceholders(raw);
  const parsed = YAML.parse(resolvedRaw);
  const result = nodeConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid node config: ${result.error.message}`);
  }
  return result.data;
}
