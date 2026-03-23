import { Task } from "@agent-mesh/shared";
import { AgentAdapter, AdapterExecutionResult, MessageContext, DeliverResult } from "./types.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export class PiAgentAdapter implements AgentAdapter {
  private pendingMessages: MessageContext[] = [];

  constructor(private readonly agentId: string, private readonly config: Record<string, any>) {}

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    this.pendingMessages.push(ctx);
    return { status: "delivered" };
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    console.log(`[node] agent:${this.agentId} executing self-host task: ${task.id}`);
    
    const prompt = task.description;
    const fileMatch = prompt.match(/FILE:\s*([^\s\n]+)/);
    const contentMatch = prompt.match(/CONTENT:\s*([\s\S]+)$|CONTENT:\s*([\s\S]+)\n\[/);

    if (fileMatch && (contentMatch?.[1] || contentMatch?.[2])) {
      const relativePath = fileMatch[1].trim();
      const content = (contentMatch[1] || contentMatch[2]).trim();
      
      const absolutePath = resolve(process.cwd(), relativePath);
      
      try {
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, content);
        const summary = `SUCCESS: Agent autonomously updated ${relativePath}`;
        return {
          summary,
          output: { stdout: summary, exitCode: 0 }
        };
      } catch (e: any) {
        throw new Error(`Self-host Write Failed: ${e.message}`);
      }
    }

    return {
      summary: "ACK: No file operation detected, task skipped.",
      output: { stdout: "no-op", exitCode: 0 }
    };
  }
}
