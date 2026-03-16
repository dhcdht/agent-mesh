import { spawn } from "node:child_process";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter } from "./types.js";

interface StdinAdapterConfig {
  command: string;
  args?: string[];
  timeoutMs: number;
}

function toConfig(cliConfig: Record<string, unknown>): StdinAdapterConfig {
  const command = String(cliConfig.command ?? "echo");
  const args = Array.isArray(cliConfig.args) ? cliConfig.args.map(String) : [];
  const timeoutMs = Number(cliConfig.timeoutMs ?? 60000);
  return {
    command,
    args,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 60000,
  };
}

export class StdinAdapter implements AgentAdapter {
  private readonly config: StdinAdapterConfig;

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(cliConfig);
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const prompt = `${task.subject}\n\n${task.description}`;
    const args = [...this.config.args, prompt];

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
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
        reject(err);
      });

      proc.stdin?.end();
    });
  }
}
