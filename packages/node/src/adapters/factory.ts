import type { AgentAdapter } from "./types.js";
import { AcpAdapter } from "./acp.js";
import { AcpPoolAdapter } from "./acp-pool.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { NoopAdapter } from "./noop.js";
import { PiAgentAdapter } from "./pi-agent.js";
import { OpenCodeSdkAdapter } from "./opencode-sdk.js";
import { OpenCodeAdapter } from "./opencode.js";
import { OpenCodeCliAdapter } from "./opencode-cli.js";
import { StdinAdapter } from "./stdin.js";

export function createAdapter(
  cliType: string,
  agentId: string,
  cliConfig: Record<string, unknown>,
  repoPath?: string
): AgentAdapter {
  const merged = { ...cliConfig };
  if (repoPath && merged.cwd === undefined) {
    merged.cwd = repoPath;
  }
  switch (cliType) {
    case "acp":
      return new AcpAdapter(agentId, merged);
    case "acp-pool":
      return new AcpPoolAdapter(agentId, merged);
    case "opencode":
      return new OpenCodeAdapter(agentId, merged);
    case "opencode-cli":
      return new OpenCodeCliAdapter(agentId, merged);
    case "claude-code":
      return new ClaudeCodeAdapter(agentId, merged);
    case "pi-agent":
      return new PiAgentAdapter(agentId, merged);
    case "opencode-sdk":
      return new OpenCodeSdkAdapter(agentId, merged);
    case "stdin":
      return new StdinAdapter(agentId, merged);
    default:
      return new NoopAdapter(agentId);
  }
}
