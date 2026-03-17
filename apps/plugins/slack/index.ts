/**
 * Slack 插件：订阅 Coordinator SSE，转发任务/消息事件
 *
 * 使用方式：
 *   MESH_ID=xxx COORDINATOR_URL=http://localhost:3000 node index.js
 *
 * 可选：SLACK_TOKEN、SLACK_CHANNEL 配置后推送到 Slack
 */

import type { ChatPlugin, PluginConfig, TaskEvent, MessageEvent } from "./types.js";

export class SlackPlugin implements ChatPlugin {
  name = "slack";
  private config: PluginConfig | null = null;
  private abortController: AbortController | null = null;

  async start(config: PluginConfig): Promise<void> {
    this.config = config;
    console.log(`[slack] plugin started, mesh: ${config.meshId}, coordinator: ${config.coordinatorUrl}`);
    this.subscribeSSE();
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.config = null;
    console.log("[slack] plugin stopped");
  }

  onTaskUpdate?(event: TaskEvent): void {
    const msg = `[${event.meshId}] 任务 ${event.taskId} -> ${event.status}${event.subject ? `: ${event.subject}` : ""}`;
    console.log(`[slack] ${msg}`);
    this.pushToSlack(msg);
  }

  onMessage?(event: MessageEvent): void {
    const payload = event.payload as Record<string, unknown>;
    const text = payload?.text ?? payload?.summary ?? payload?.error ?? JSON.stringify(payload);
    const msg = `[${event.meshId}] ${event.from} -> ${event.to} (${event.type}): ${String(text).slice(0, 200)}`;
    console.log(`[slack] ${msg}`);
    this.pushToSlack(msg);
  }

  private async pushToSlack(text: string): Promise<void> {
    const cfg = this.config;
    if (!cfg?.slackToken || !cfg?.slackChannel) return;
    try {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.slackToken}`,
        },
        body: JSON.stringify({ channel: cfg.slackChannel, text }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`[slack] postMessage failed: ${res.status} ${err}`);
      }
    } catch (e) {
      console.error("[slack] pushToSlack error:", e);
    }
  }

  private subscribeSSE(): void {
    const cfg = this.config;
    if (!cfg) return;

    this.abortController = new AbortController();
    const url = `${cfg.coordinatorUrl.replace(/\/$/, "")}/api/v1/events?meshId=${encodeURIComponent(cfg.meshId)}`;
    const headers: Record<string, string> = {};
    if (cfg.apiKey) {
      headers.authorization = `Bearer ${cfg.apiKey}`;
    }

    fetch(url, { signal: this.abortController.signal, headers })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          console.error(`[slack] SSE connect failed: ${res.status}`);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as {
                  type: string;
                  meshId: string;
                  task?: { id: string; status: string; subject?: string; owner?: string };
                  message?: { from: string; to: string; type: string; payload: unknown };
                };
                this.handleEvent(data);
              } catch {
                // ignore parse error
              }
            }
          }
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") {
          console.error("[slack] SSE error:", e);
        }
      });
  }

  private handleEvent(data: {
    type: string;
    meshId: string;
    task?: { id: string; status: string; subject?: string; owner?: string };
    message?: { from: string; to: string; type: string; payload: unknown };
  }): void {
    if (data.type === "task.created" || data.type === "task.updated") {
      const t = data.task;
      if (t) {
        this.onTaskUpdate?.({
          meshId: data.meshId,
          taskId: t.id,
          status: t.status,
          subject: t.subject,
          owner: t.owner,
        });
      }
    } else if (data.type === "message.created") {
      const m = data.message;
      if (m) {
        this.onMessage?.({
          meshId: data.meshId,
          from: m.from,
          to: m.to,
          type: m.type,
          payload: m.payload,
        });
      }
    }
  }
}
