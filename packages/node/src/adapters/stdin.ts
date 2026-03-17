import { spawn } from "node:child_process";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter } from "./types.js";

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

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(cliConfig);
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const baseArgs = this.config.args ?? [];
    const args = this.config.argsOnly
      ? baseArgs
      : [...baseArgs, `${task.subject}\n\n${task.description}`];

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
        reject(err);
      });

      proc.stdin?.end();
    });
  }
}
