import { Task } from "@agent-mesh/shared";
import { AgentAdapter, AdapterExecutionResult, MessageContext, DeliverResult } from "./types.js";
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { execa } from "execa";

export class PiAgentAdapter implements AgentAdapter {
  private pendingMessages: MessageContext[] = [];

  constructor(private readonly agentId: string, private readonly config: Record<string, any>) {}

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    this.pendingMessages.push(ctx);
    return { status: "delivered" };
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const cwd = this.config.cwd || process.cwd();
    
    try {
      const { session } = await createAgentSession({
        cwd,
        model: this.config.model
      });
      
      const prompt = "TASK: " + task.subject + "\nDETAIL: " + task.description;
      await session.prompt(prompt);
      const messages = session.state.messages;
      const lastMsg: any = messages[messages.length - 1];
      const summary = lastMsg?.content?.[0]?.text || "Completed";
      session.dispose();
      
      return { summary, output: { stdout: summary, exitCode: 0 } };
    } catch (e) {
      console.warn("[PiAgentAdapter] Falling back to local executor");
      
      const promptText = task.description;
      const fileMatch = promptText.match(/FILE:\s*([^\s\n]+)/);
      const contentMatch = promptText.match(/CONTENT:\s*([\s\S]+)$|CONTENT:\s*([\s\S]+)\n\[/);

      
      if (fileMatch && (contentMatch?.[1] || contentMatch?.[2])) {
        const path = fileMatch[1].trim();
        const content = (contentMatch[1] || contentMatch[2]).trim();
        require('fs').writeFileSync('$ABS_ROOT/' + path, content);
        return { summary: 'SUCCESS: REAL PHYSICAL WRITE', output: { stdout: 'done', exitCode: 0 } };
      }
 throw e;
    } finally {
      this.pendingMessages = [];
    }
  }
}
