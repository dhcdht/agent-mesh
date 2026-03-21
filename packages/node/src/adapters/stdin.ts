import { spawn } from "node:child_process";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter, MessageContext, DeliverResult } from "./types.js";

interface StdinAdapterConfig {
  command: string;
  args?: string[];
  timeoutMs: number;
  cwd?: string;
  /** 若 true，不把 task 内容追加到 args（用于 pnpm test 等纯命令） */
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
    let promptText = `${task.subject}\n\n${task.description}`;
    
    if (this.pendingMessages.length > 0) {
      promptText += "\n\nRecent team messages:\n";
      this.pendingMessages.forEach((msg, idx) => {
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
        promptText += `${idx + 1}. [${msg.from} -> ${msg.to}] (${msg.type}): ${payloadStr}\n`;
      });
      this.pendingMessages = [];
    }

    const args = this.config.argsOnly
      ? baseArgs
      : [...baseArgs, promptText];

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        cwd: this.config.cwd,
      });

      const chunks: Buffer[] = [];
      proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      proc.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));

      const timeout = setTimeout(() => {
        proc.kill("SIGTERM");
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
          reject(
            new Error(
              `Stdin adapter exited with code ${code}${signal ? ` signal ${signal}` : ""}: ${output.slice(0, 200)}`
            )
          );
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        if ((err as any).code === "ENOENT") {
          reject(new Error(`Command not found: ${this.config.command}. Please ensure it is installed and in your PATH.`));
        } else {
          reject(err);
        }
      });

      proc.stdin?.end();
    });
  }
}
