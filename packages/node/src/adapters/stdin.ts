import { spawn } from "node:child_process";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter, MessageContext, DeliverResult } from "./types.js";

interface StdinAdapterConfig {
  command: string;
  args?: string[];
  timeoutMs: number;
  cwd?: string;
  argsOnly?: boolean;
}

function toConfig(cliConfig: Record<string, unknown>): StdinAdapterConfig {
  const command = String(cliConfig.command ?? "echo");
  const args = Array.isArray(cliConfig.args) ? cliConfig.args.map(String) : [];
  const timeoutMs = Number(cliConfig.timeoutMs ?? 60000);
  const cwd = cliConfig.cwd ? String(cliConfig.cwd) : undefined;
  const argsOnly = cliConfig.argsOnly === true;
  return {
    command,
    args,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 60000,
    cwd,
    argsOnly,
  };
}

export class StdinAdapter implements AgentAdapter {
  private readonly config: StdinAdapterConfig;
  private pendingMessages: MessageContext[] = [];

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(cliConfig);
  }

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    this.pendingMessages.push(ctx);
    return { status: "delivered" };
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const baseArgs = this.config.args ?? [];
    
    let identityContext = `[IDENTITY]\nYou are ${this.agentId}.\n`;
    identityContext += `Responsibility: ${this.config.cwd || "current directory"}.\n\n`;
    
    let promptText = `${identityContext}[TOOLS]\nYou have 'mesh-edit' in PATH. Use it for ALL file/git operations to avoid interactive prompts.\n`;
    promptText += `  mesh-edit read path=<file>\n  mesh-edit write path=<file> content=<text>\n  mesh-edit edit path=<file> old=<text> new=<text>\n  mesh-edit git-commit message=<msg>\n\n`;
    promptText += `[TASK]\n${task.subject}\n\n${task.description}`;
    
    if (this.pendingMessages.length > 0) {
      promptText += "\n\n[TEAM MESSAGES (RECENT)]\n";
      const recentMessages = this.pendingMessages.slice(-10);
      recentMessages.forEach((msg, idx) => {
        let payloadStr = "";
        if (typeof msg.payload === "string") {
          payloadStr = msg.payload;
        } else {
          try {
            payloadStr = JSON.stringify(msg.payload);
          } catch {
            payloadStr = String(msg.payload);
          }
        }
        promptText += `Message ${idx + 1}: From ${msg.from} to ${msg.to} (${msg.type})\nContent: ${payloadStr.slice(0, 2000)}\n\n`;
      });
      this.pendingMessages = [];
    }

    const args = baseArgs;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        cwd: this.config.cwd,
      });

      const chunks: Buffer[] = [];
      proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      proc.stderr?.on("data", (chunk: Buffer) => {
        console.error(`[AGENT:${this.agentId}:STDERR] ${chunk.toString()}`);
        chunks.push(chunk);
      });

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`Stdin adapter timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      proc.on("close", (code, signal) => {
        clearTimeout(timeout);
        const output = Buffer.concat(chunks).toString("utf-8").trim();
        if (code === 0) {
          resolve({
            summary: output || `Task ${task.id} completed by ${this.config.command}`,
            output: { output, exitCode: code },
          });
        } else {
          reject(new Error(`Stdin adapter exited with code ${code}: ${output.slice(0, 200)}`));
        }
      });

      if (proc.stdin) {
        proc.stdin.write(promptText);
        proc.stdin.end();
      }
    });
  }
}
