/**
 * 飞书插件：订阅 Coordinator SSE，转发任务/消息事件到飞书群
 *
 * 使用方式：
 *   MESH_ID=xxx COORDINATOR_URL=http://localhost:3000 node run.js
 *
 * 可选：FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_CHAT_ID 配置后推送到飞书群
 * 可选：FEISHU_VERIFICATION_TOKEN、FEISHU_EVENTS_PORT 配置后接收用户回复（需公网 URL）
 *
 * 飞书配置步骤：
 * 1. 创建自建应用，开启机器人能力
 * 2. 权限：im:message、im:message:send_as_bot
 * 3. 事件订阅：订阅「接收消息 v2.0」im.message.receive_v1
 * 4. 请求 URL 配置为 https://<公网>:<FEISHU_EVENTS_PORT>/feishu/events
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { FeishuPluginConfig, TaskEvent, MessageEvent } from "./types.js";

interface TokenResponse {
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuEventPayload {
  type?: string;
  challenge?: string;
  token?: string;
  header?: { event_type?: string };
  event?: {
    message?: {
      message_id?: string;
      chat_id?: string;
      content?: string;
      message_type?: string;
    };
    sender?: { sender_id?: { open_id?: string } };
  };
}

export class FeishuPlugin {
  name = "feishu";
  private config: FeishuPluginConfig | null = null;
  private abortController: AbortController | null = null;
  private eventsServer: ReturnType<typeof createServer> | null = null;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  async start(config: FeishuPluginConfig): Promise<void> {
    this.config = config;
    console.log(`[feishu] plugin started, mesh: ${config.meshId}, coordinator: ${config.coordinatorUrl}`);
    this.subscribeSSE();
    if (config.verificationToken && config.eventsPort) {
      this.startEventsServer(config.eventsPort, config.verificationToken);
    }
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.eventsServer) {
      await new Promise<void>((resolve) => {
        this.eventsServer!.close(() => resolve());
      });
      this.eventsServer = null;
    }
    this.config = null;
    this.tokenCache = null;
    console.log("[feishu] plugin stopped");
  }

  private async getTenantAccessToken(): Promise<string | null> {
    const cfg = this.config;
    if (!cfg?.appId || !cfg?.appSecret) return null;

    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }

    try {
      const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
      });
      const data = (await res.json()) as TokenResponse;
      if (data.tenant_access_token && data.expire) {
        this.tokenCache = {
          token: data.tenant_access_token,
          expiresAt: Date.now() + data.expire * 1000,
        };
        return data.tenant_access_token;
      }
    } catch (e) {
      console.error("[feishu] getTenantAccessToken error:", e);
    }
    return null;
  }

  private startEventsServer(port: number, verificationToken: string): void {
    this.eventsServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || req.url !== "/feishu/events") {
        res.writeHead(404);
        res.end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      let data: FeishuEventPayload;
      try {
        data = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end("invalid json");
        return;
      }

      if (data.type === "url_verification") {
        if (verificationToken && data.token !== verificationToken) {
          res.writeHead(401);
          res.end("token mismatch");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: data.challenge }));
        return;
      }

      if (data.type === "event_callback" && data.event) {
        const eventType = data.header?.event_type ?? (data.event as { type?: string }).type;
        const ev = data.event;
        if (eventType === "im.message.receive_v1" && ev.message) {
          const cfg = this.config;
          if (cfg && ev.message.chat_id === cfg.chatId) {
            let text = "";
            try {
              const content = JSON.parse(ev.message.content ?? "{}") as { text?: string };
              text = content.text ?? "";
            } catch {
              text = String(ev.message.content ?? "");
            }
            text = text.trim();
            if (text) {
              let to = "*";
              let msg = text;
              if (text.startsWith("@")) {
                const space = text.indexOf(" ");
                if (space > 0) {
                  to = text.slice(1, space).trim();
                  msg = text.slice(space + 1).trim();
                } else {
                  to = text.slice(1).trim();
                  msg = "";
                }
              } else if (text.startsWith("* ")) {
                msg = text.slice(2).trim();
              }
              if (msg) {
                try {
                  await this.forwardToCoordinator(cfg, to, msg);
                } catch (e) {
                  console.error("[feishu] forwardToCoordinator error:", e);
                }
              }
            }
          }
        }
      }

      res.writeHead(200);
      res.end();
    });
    this.eventsServer.listen(port, "0.0.0.0", () => {
      console.log(`[feishu] events server listening on :${port}, configure Feishu Request URL: http://<your-host>:${port}/feishu/events`);
    });
  }

  private async forwardToCoordinator(cfg: FeishuPluginConfig, to: string, text: string): Promise<void> {
    const url = `${cfg.coordinatorUrl.replace(/\/$/, "")}/api/v1/messages`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    };
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: randomUUID(),
        meshId: cfg.meshId,
        from: "lead",
        to,
        type: "message",
        payload: { text },
      }),
    });
    if (!res.ok) {
      throw new Error(`Coordinator ${res.status}: ${await res.text()}`);
    }
    console.log(`[feishu] forwarded: lead -> ${to}`);
  }

  onTaskUpdate(event: TaskEvent): void {
    const msg = `[${event.meshId}] 任务 ${event.taskId} -> ${event.status}${event.subject ? `: ${event.subject}` : ""}`;
    console.log(`[feishu] ${msg}`);
    this.pushToFeishu(msg);
  }

  onMessage(event: MessageEvent): void {
    const payload = event.payload as Record<string, unknown>;
    const text = payload?.text ?? payload?.summary ?? payload?.error ?? JSON.stringify(payload);
    const msg = `[${event.meshId}] ${event.from} -> ${event.to} (${event.type}): ${String(text).slice(0, 200)}`;
    console.log(`[feishu] ${msg}`);
    this.pushToFeishu(msg);
  }

  private async pushToFeishu(text: string): Promise<void> {
    const cfg = this.config;
    if (!cfg?.chatId) return;
    const token = await this.getTenantAccessToken();
    if (!token) return;
    try {
      const res = await fetch(
        `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receive_id: cfg.chatId,
            msg_type: "text",
            content: JSON.stringify({ text }),
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        console.error(`[feishu] send message failed: ${res.status} ${err}`);
      }
    } catch (e) {
      console.error("[feishu] pushToFeishu error:", e);
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
          console.error(`[feishu] SSE connect failed: ${res.status}`);
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
          console.error("[feishu] SSE error:", e);
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
