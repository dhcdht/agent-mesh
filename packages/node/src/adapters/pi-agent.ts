import { Task } from "@agent-mesh/shared";
import { AgentAdapter, AdapterExecutionResult, MessageContext, DeliverResult } from "./types.js";
import { createAgentSession } from "@mariozechner/pi-coding-agent";

export class PiAgentAdapter implements AgentAdapter {
  private pendingMessages: MessageContext[] = [];

  constructor(private readonly agentId: string, private readonly config: Record<string, any>) {}

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    this.pendingMessages.push(ctx);
    return { status: "delivered" };
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    console.log(`[PiAgentAdapter] Starting REAL SDK session for ${this.agentId}...`);
    
    const cwd = this.config.cwd || process.cwd();

    try {
      const { session } = await createAgentSession({
        cwd,
        model: this.config.model || "anthropic/claude-3-5-sonnet-20241022"
      });

      let isDone = false;
      const completionPromise = new Promise<void>((resolve) => {
        session.subscribe((event: any) => {
          if (event.type === 'message_end' && event.message.role === 'assistant') {
            const messages = session.state.messages;
            const lastMsg: any = messages[messages.length - 1];
            const hasPendingTools = lastMsg?.content?.some((c: any) => c.type === 'toolCall');
            if (!hasPendingTools) {
              isDone = true;
              resolve();
            }
          }
        });
        setTimeout(() => { if (!isDone) resolve(); }, 300000);
      });

      const promptText = `TASK: ${task.subject}\nDETAIL: ${task.description}\nRECENT_MESSAGES: ${JSON.stringify(this.pendingMessages)}`;

      await session.prompt(promptText);
      await completionPromise;

      const finalMessages = session.state.messages;
      const lastAssistantMsg: any = finalMessages[finalMessages.length - 1];
      const summary = lastAssistantMsg?.content
        ?.filter((c: any) => c.type === 'text')
        ?.map((c: any) => c.text)
        ?.join('\n') || "Task completed.";

      session.dispose();

      return {
        summary,
        output: { stdout: summary, stderr: "", exitCode: 0 }
      };
    } catch (e: any) {
      throw new Error(`Pi SDK Runtime Error: ${e.message}`);
    } finally {
      this.pendingMessages = [];
    }
  }
}
