import type { Task } from "@agent-mesh/shared";

export interface AdapterExecutionResult {
  summary: string;
  output?: unknown;
}

export interface AgentAdapter {
  execute(task: Task): Promise<AdapterExecutionResult>;
}
