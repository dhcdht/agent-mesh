import { Task } from "@agent-mesh/shared";
import { AgentAdapter, AdapterExecutionResult, MessageContext, DeliverResult } from "./types.js";
import { createOpencode } from "@opencode-ai/sdk";

export class OpenCodeSdkAdapter implements AgentAdapter {
  private pendingMessages: MessageContext[] = [];

  constructor(private readonly agentId: string, private readonly config: Record<string, any>) {}

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    this.pendingMessages.push(ctx);
    return { status: "delivered" };
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const cwd = typeof this.config.cwd === 'string' ? this.config.cwd : process.cwd();
    
    try {
      const { client, server } = await createOpencode({
        config: {
          model: this.config.model || "anthropic/claude-3-5-sonnet-20241022",
        },
      });

      // 根据 SDK 物理核查后的正确 schema 编写
      const sessionRes = await client.session.create({
        body: {
          cwd,
          title: `Mesh Session: ${task.id}`
        }
      } as any);

      if (sessionRes.error) {
        throw new Error("Failed to create session: " + JSON.stringify(sessionRes.error));
      }

      const sessionId = (sessionRes.data as any)?.id;
      if (!sessionId) throw new Error("No sessionId returned");

      let promptText = `You are agent ${this.agentId}. Complete task ${task.id}: ${task.subject}\n\n${task.description}`;
      
      const response = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: promptText }]
        }
      } as any);

      if (response.error) throw new Error("Prompt error: " + JSON.stringify(response.error));

      const summary = (response.data as any)?.parts
        ?.filter((p: any) => p.type === 'text')
        ?.map((p: any) => p.text)
        ?.join('\n') || "Task completed via OpenCode SDK";

      await client.session.delete({ path: { id: sessionId } } as any);
      server.close();

      return {
        summary,
        output: { stdout: summary, stderr: "", exitCode: 0 }
      };
    } catch (e) {
      throw new Error(`OpenCode SDK Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.pendingMessages = [];
    }
  }
}
