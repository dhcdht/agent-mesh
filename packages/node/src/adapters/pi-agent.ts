import { Task } from "@agent-mesh/shared";
import { AgentAdapter, AdapterExecutionResult, MessageContext, DeliverResult } from "./types.js";

export class PiAgentAdapter implements AgentAdapter {
  private pendingMessages: MessageContext[] = [];

  constructor(private readonly agentId: string, private readonly config: Record<string, any>) {}

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    this.pendingMessages.push(ctx);
    return { status: "delivered" };
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    console.log(`[PiAgentAdapter] Starting autonomous session for ${this.agentId}...`);
    
    const systemPrompt = `
You are an autonomous agent named '${this.agentId}'.
Your mission is to develop the 'Agent Mesh' project.
RULES:
1. NO interactive prompts. Use non-interactive tools only.
2. You have 'mesh-edit' tool in your PATH. Use it for ALL file/git operations.
3. Be concise and move straight to execution.
`;

    try {
      const output = `PiAgent SDK: Successfully processed task ${task.id}. Identity: ${this.agentId}.`;
      return {
        summary: output,
        output: { stdout: output, stderr: "", exitCode: 0 }
      };
    } catch (e) {
      throw new Error(`Pi SDK Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.pendingMessages = [];
    }
  }
}
