import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter, DeliverResult, MessageContext } from "./types.js";

export class NoopAdapter implements AgentAdapter {
  constructor(private readonly agentId: string) {}

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const summary = `agent ${this.agentId} completed task ${task.id}: ${task.subject}`;
    return {
      summary,
      output: {
        taskId: task.id,
        subject: task.subject,
      },
    };
  }

  async deliverMessage(_ctx: MessageContext): Promise<DeliverResult> {
    return { status: "delivered" };
  }
}
