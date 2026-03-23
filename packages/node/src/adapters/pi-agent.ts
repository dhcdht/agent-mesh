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
    
    const cwd = typeof this.config.cwd === 'string' ? this.config.cwd : process.cwd();

    try {
      const { session } = await createAgentSession({
        cwd,
        model: this.config.model || "anthropic/claude-3-5-sonnet-20241022"
      });

      let isDone = false;
      const completionPromise = new Promise<void>((resolve) => {
        const unsubscribe = session.subscribe((event: any) => {
          if (event.type === 'tool_execution_start') {
            console.log(`[PiAgentAdapter] Agent ${this.agentId} calling tool: ${event.toolName}`);
          }
          if (event.type === 'message_end' && event.message.role === 'assistant') {
            const lastMsg: any = session.state.messages[session.state.messages.length - 1];
            const hasPendingTools = lastMsg?.content?.some((c: any) => c.type === 'toolCall');
            if (!hasPendingTools) {
              isDone = true;
              resolve();
            }
          }
        });
        
        setTimeout(() => { if (!isDone) resolve(); }, 300000);
      });

      const promptText = `
[IDENTITY]
You are agent '${this.agentId}'. Your workspace is: ${cwd}.
[TOOLS]
Use BASH or your built-in file tools to execute:
${task.subject}
${task.description}
[MESSAGES]
${JSON.stringify(this.pendingMessages)}
      `;

      await session.prompt(promptText);
      await completionPromise;

      const lastMsg: any = session.state.messages[session.state.messages.length - 1];
      const resultText = lastMsg?.content
        ?.filter((c: any) => c.type === 'text')?.map((c: any) => c.text)?.join('\n') || "Complete";

      session.dispose();


      return {
        summary: resultText,
        output: { stdout: resultText, stderr: "", exitCode: 0 }
      };
    } catch (e) {
      throw new Error(`REAL Pi SDK Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.pendingMessages = [];
    }
  }
}
