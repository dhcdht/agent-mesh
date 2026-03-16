import type { AgentAdapter } from "./types.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { NoopAdapter } from "./noop.js";
import { OpenCodeAdapter } from "./opencode.js";
import { StdinAdapter } from "./stdin.js";

export function createAdapter(
  cliType: string,
  agentId: string,
  cliConfig: Record<string, unknown>
): AgentAdapter {
  switch (cliType) {
    case "opencode":
      return new OpenCodeAdapter(agentId, cliConfig);
    case "claude-code":
      return new ClaudeCodeAdapter(agentId, cliConfig);
    case "stdin":
      return new StdinAdapter(agentId, cliConfig);
    default:
      return new NoopAdapter(agentId);
  }
}
