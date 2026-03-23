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

    const systemPrompt = `
You are agent '${this.agentId}'. Your workspace is: ${cwd}.
[CRITICAL] When the user says "FILE: <path> CONTENT: <text>", you MUST use the 'mesh-edit' tool to perform the write immediately.
DO NOT provide conversational confirmation. Use the 'bash' or 'mesh-edit' tool to modify the file.
    `;

      const promptText = `
${systemPrompt}
TASK: ${task.subject}
DETAIL: ${task.description}
RECENT_MESSAGES: ${JSON.stringify(this.pendingMessages)}
      `;

      await session.prompt(promptText);

      let isDone = false;
      let lastMessageCount = session.state.messages.length;
      let stableRounds = 0;

      while (!isDone && stableRounds < 10) {
        await new Promise(r => setTimeout(r, 2000));
        if (session.state.messages.length === lastMessageCount) {
          stableRounds++;
        } else {
          stableRounds = 0;
          lastMessageCount = session.state.messages.length;
        }
        
        const lastMsg = session.state.messages[session.state.messages.length - 1];
        if (lastMsg.role === 'assistant' && !lastMsg.content.some((c: any) => c.type === 'toolCall')) {
          isDone = true;
        }
      }

      const messages = session.state.messages;
      const lastMsg = messages[messages.length - 1];
      const resultText = lastMsg && lastMsg.role === 'assistant' 
        ? lastMsg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
        : `Pi SDK autonomous run complete for ${task.id}`;

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
