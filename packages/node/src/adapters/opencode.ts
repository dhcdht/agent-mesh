import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter } from "./types.js";

interface OpenCodeAdapterConfig {
  serverUrl: string;
  endpoint: string;
  model?: string;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}

interface OpenCodeResponse {
  summary?: string;
  output?: unknown;
  text?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toConfig(cliConfig: Record<string, unknown>): OpenCodeAdapterConfig {
  const serverUrl = String(cliConfig.serverUrl ?? "http://localhost:4096").replace(/\/$/, "");
  const endpoint = String(cliConfig.endpoint ?? "/run");
  const model = cliConfig.model ? String(cliConfig.model) : undefined;
  const timeoutMs = Number(cliConfig.timeoutMs ?? 20000);
  const retryCount = Number(cliConfig.retryCount ?? 2);
  const retryDelayMs = Number(cliConfig.retryDelayMs ?? 1000);

  return {
    serverUrl,
    endpoint,
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 20000,
    retryCount: Number.isFinite(retryCount) ? retryCount : 2,
    retryDelayMs: Number.isFinite(retryDelayMs) ? retryDelayMs : 1000,
  };
}

export class OpenCodeAdapter implements AgentAdapter {
  private readonly config: OpenCodeAdapterConfig;

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(cliConfig);
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(`${this.config.serverUrl}${this.config.endpoint}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            task: {
              id: task.id,
              subject: task.subject,
              description: task.description,
              repoId: task.repoId,
            },
            prompt: `You are agent ${this.agentId}. Complete task ${task.id}: ${task.subject}`,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`opencode error ${response.status}: ${text}`);
        }

        const payload = (await response.json()) as OpenCodeResponse;
        return {
          summary: payload.summary ?? payload.text ?? `task ${task.id} completed by opencode`,
          output: payload.output ?? payload,
        };
      } catch (error) {
        lastError = error;
        if (attempt < this.config.retryCount) {
          await sleep(this.config.retryDelayMs);
          continue;
        }
      }
    }

    throw new Error(
      `OpenCode adapter failed after ${this.config.retryCount + 1} attempts: ${String(lastError)}`
    );
  }
}
