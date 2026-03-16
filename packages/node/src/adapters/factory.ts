import type { AgentAdapter } from "./types.js";
import { NoopAdapter } from "./noop.js";
import { OpenCodeAdapter } from "./opencode.js";

export function createAdapter(
  cliType: string,
  agentId: string,
  cliConfig: Record<string, unknown>
): AgentAdapter {
  switch (cliType) {
    case "opencode":
      return new OpenCodeAdapter(agentId, cliConfig);
    case "claude-code":
    case "stdin":
      return new NoopAdapter(agentId);
    default:
      return new NoopAdapter(agentId);
  }
}
