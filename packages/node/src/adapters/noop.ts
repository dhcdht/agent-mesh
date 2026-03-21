import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter, DeliverResult, MessageContext } from "./types.js";

export class NoopAdapter implements AgentAdapter {
  constructor(private readonly agentId: string) {}

  async execute(task: Task): Promise<AdapterExecutionResult> {
    let summary = `agent ${this.agentId} completed task ${task.id}: ${task.subject}`;
    
    if (this.agentId === "agent-coordinator") {
      summary = "作为协调者，我已审查了方案。建议通过 API 路由暴露新的 /claim 接口，并确保状态转换幂等。";
    } else if (this.agentId === "agent-shared") {
      summary = "类型定义已就绪：CreateTaskPayload 包含 subject, desc, owner。建议使用 Zod 进行校验。";
    } else if (this.agentId === "agent-cli") {
      summary = "CLI 端已做好接入准备，将在 bin/mesh-task 实现后，通过 commander 增加对应的子命令。";
    }

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
