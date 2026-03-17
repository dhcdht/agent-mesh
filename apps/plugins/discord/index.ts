/**
 * Discord 插件：订阅 Coordinator SSE，转发任务/消息事件到 Discord 频道
 *
 * 使用方式：
 *   MESH_ID=xxx COORDINATOR_URL=http://localhost:3000 node run.js
 *
 * 可选：DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID 配置后推送到 Discord 频道
 *
 * 注意：Discord 接收用户消息需通过 Gateway（WebSocket）或 Interactions（Slash Commands）。
 * 当前仅实现推送；用户回复可通过 CLI chat 或后续扩展 Interactions 端点。
 *
 * Discord 配置步骤：
 * 1. 创建 Discord 应用，添加 Bot
 * 2. 邀请 Bot 到服务器，授予「发送消息」权限
 * 3. 获取 Bot Token、频道 ID（开发者模式开启后右键频道可复制）
 */

import type { DiscordPluginConfig, TaskEvent, MessageEvent } from "./types.js";

export class DiscordPlugin {
  name = "discord";
  private config: DiscordPluginConfig | null = null;
  private abortController: AbortController | null = null;

  async start(config: DiscordPluginConfig): Promise<void> {
    this.config = config;
    console.log(`[discord] plugin started, mesh: ${config.meshId}, coordinator: ${config.coordinatorUrl}`);
    this.subscribeSSE();
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.config = null;
    console.log("[discord] plugin stopped");
  }

  onTaskUpdate(event: TaskEvent): void {
    const msg = `[${event.meshId}] 任务 ${event.taskId} -> ${event.status}${event.subject ? `: ${event.subject}` : ""}`;
    console.log(`[discord] ${msg}`);
    this.pushToDiscord(msg);
  }

  onMessage(event: MessageEvent): void {
    const payload = event.payload as Record<string, unknown>;
    const text = payload?.text ?? payload?.summary ?? payload?.error ?? JSON.stringify(payload);
    const msg = `[${event.meshId}] ${event.from} -> ${event.to} (${event.type}): ${String(text).slice(0, 200)}`;
    console.log(`[discord] ${msg}`);
    this.pushToDiscord(msg);
  }

  private async pushToDiscord(text: string): Promise<void> {
    const cfg = this.config;
    if (!cfg?.botToken || !cfg?.channelId) return;
    try {
      const res = await fetch(`https://discord.com/api/v10/channels/${cfg.channelId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${cfg.botToken}`,
        },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error(`[discord] send message failed: ${res.status} ${err}`);
      }
    } catch (e) {
      console.error("[discord] pushToDiscord error:", e);
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
          console.error(`[discord] SSE connect failed: ${res.status}`);
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
          console.error("[discord] SSE error:", e);
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
        this.onTaskUpdate({
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
        this.onMessage({
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
