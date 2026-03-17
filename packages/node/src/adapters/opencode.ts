import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter } from "./types.js";

interface OpenCodeAdapterConfig {
  serverUrl: string;
  model?: string;
  username?: string;
  password?: string;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}

interface OpenCodeMessageResponse {
  info: { id: string };
  parts: Array<{ type: string; text?: string }>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toConfig(cliConfig: Record<string, unknown>): OpenCodeAdapterConfig {
  const serverUrl = String(cliConfig.serverUrl ?? "http://localhost:4096").replace(/\/$/, "");
  const model = cliConfig.model ? String(cliConfig.model) : undefined;
  const username = cliConfig.username ? String(cliConfig.username) : undefined;
  const password = cliConfig.password ? String(cliConfig.password) : undefined;
  const timeoutMs = Number(cliConfig.timeoutMs ?? 120000);
  const retryCount = Number(cliConfig.retryCount ?? 2);
  const retryDelayMs = Number(cliConfig.retryDelayMs ?? 1000);

  return {
    serverUrl,
    model,
    username,
    password,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120000,
    retryCount: Number.isFinite(retryCount) ? retryCount : 2,
    retryDelayMs: Number.isFinite(retryDelayMs) ? retryDelayMs : 1000,
  };
}

export class OpenCodeAdapter implements AgentAdapter {
  private readonly config: OpenCodeAdapterConfig;

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(cliConfig);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.config.username && this.config.password) {
      const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    }
    return headers;
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.config.retryCount; attempt += 1) {
      try {
        const headers = this.getHeaders();
        const prompt = `You are agent ${this.agentId}. Complete task ${task.id}: ${task.subject}\n\n${task.description}`;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const sessionRes = await fetch(`${this.config.serverUrl}/session`, {
          method: "POST",
          headers,
          body: JSON.stringify({ title: `Task: ${task.subject}` }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!sessionRes.ok) {
          const text = await sessionRes.text();
          throw new Error(`create session failed: ${sessionRes.status} ${text}`);
        }

        const session = (await sessionRes.json()) as { id: string };

        const msgTimeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const msgRes = await fetch(`${this.config.serverUrl}/session/${session.id}/message`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            parts: [{ type: "text", text: prompt }],
            model: this.config.model ? { id: this.config.model } : undefined,
          }),
          signal: controller.signal,
        });

        clearTimeout(msgTimeout);

        if (!msgRes.ok) {
          const text = await msgRes.text();
          throw new Error(`send message failed: ${msgRes.status} ${text}`);
        }

        const msg = (await msgRes.json()) as OpenCodeMessageResponse;
        const textParts = msg.parts?.filter((p) => p.type === "text").map((p) => p.text).join("\n") || "";

        return {
          summary: textParts.slice(-500) || `Task ${task.id} completed`,
          output: { sessionId: session.id, parts: msg.parts },
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
