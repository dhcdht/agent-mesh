import { spawn } from "node:child_process";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter } from "./types.js";

interface OpenCodeCliConfig {
  model?: string;
  timeoutMs: number;
}

function toConfig(cliConfig: Record<string, unknown>): OpenCodeCliConfig {
  const model = cliConfig.model ? String(cliConfig.model) : undefined;
  const timeoutMs = Number(cliConfig.timeoutMs ?? 120000);
  return {
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120000,
  };
}

export class OpenCodeCliAdapter implements AgentAdapter {
  private readonly config: OpenCodeCliConfig;

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(cliConfig);
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const prompt = `${task.subject}\n\n${task.description}`;

    return new Promise((resolve, reject) => {
      const args = ["run", prompt, "--print-logs"];
      if (this.config.model) {
        args.push("-m", this.config.model);
      }

      const proc = spawn("opencode", args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        cwd: process.cwd(),
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];

      proc.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      proc.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

      const timeout = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`OpenCode CLI timed out after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      proc.on("close", (code, signal) => {
        clearTimeout(timeout);
        const out = Buffer.concat(stdout).toString("utf-8");
        const err = Buffer.concat(stderr).toString("utf-8");

        if (code === 0) {
          resolve({
            summary: out.slice(-500) || `Task ${task.id} completed`,
            output: { stdout: out, stderr: err, exitCode: code },
          });
        } else {
          reject(
            new Error(
              `OpenCode exited with code ${code}${signal ? ` signal ${signal}` : ""}: ${err.slice(0, 500)}`
            )
          );
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
}