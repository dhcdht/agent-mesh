/**
 * Slack 插件：订阅 Coordinator SSE，转发任务/消息事件
 *
 * 使用方式：
 *   MESH_ID=xxx COORDINATOR_URL=http://localhost:3000 node index.js
 *
 * 可选：SLACK_TOKEN、SLACK_CHANNEL 配置后推送到 Slack
 * 可选：SLACK_SIGNING_SECRET、SLACK_EVENTS_PORT 配置后接收用户回复（需公网 URL）
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { ChatPlugin, PluginConfig, TaskEvent, MessageEvent } from "./types.js";

export class SlackPlugin implements ChatPlugin {
  name = "slack";
  private config: PluginConfig | null = null;
  private abortController: AbortController | null = null;
  private eventsServer: ReturnType<typeof createServer> | null = null;

  async start(config: PluginConfig): Promise<void> {
    this.config = config;
    console.log(`[slack] plugin started, mesh: ${config.meshId}, coordinator: ${config.coordinatorUrl}`);
    this.subscribeSSE();
    if (config.slackSigningSecret && config.slackEventsPort) {
      this.startEventsServer(config.slackEventsPort, config.slackSigningSecret);
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
    console.log("[slack] plugin stopped");
  }

  private startEventsServer(port: number, signingSecret: string): void {
    this.eventsServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || req.url !== "/slack/events") {
        res.writeHead(404);
        res.end();
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }
      const rawBody = body;

      // Verify signature
      const sig = req.headers["x-slack-signature"] as string | undefined;
      if (sig?.startsWith("v0=")) {
        const expected = "v0=" + createHmac("sha256", signingSecret).update(rawBody).digest("hex");
        const sigBuf = Buffer.from(sig.slice(3), "hex");
        const expBuf = Buffer.from(expected.slice(3), "hex");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          res.writeHead(401);
          res.end("invalid signature");
          return;
        }
      }

      let data: { type?: string; challenge?: string; event?: { type?: string; text?: string; channel?: string; user?: string; bot_id?: string } };
      try {
        data = JSON.parse(rawBody);
      } catch {
        res.writeHead(400);
        res.end("invalid json");
        return;
      }

      if (data.type === "url_verification") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: data.challenge }));
        return;
      }

      if (data.type === "event_callback" && data.event) {
        const ev = data.event;
        if (ev.type === "message" && ev.text && !ev.bot_id) {
          const cfg = this.config;
          if (cfg && ev.channel === cfg.slackChannel) {
            const text = ev.text.trim();
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
                console.error("[slack] forwardToCoordinator error:", e);
              }
            }
          }
        }
      }

      res.writeHead(200);
      res.end();
    });
    this.eventsServer.listen(port, "0.0.0.0", () => {
      console.log(`[slack] events server listening on :${port}, configure Slack Request URL: http://<your-host>:${port}/slack/events`);
    });
  }

  private async forwardToCoordinator(cfg: PluginConfig, to: string, text: string): Promise<void> {
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
    console.log(`[slack] forwarded: lead -> ${to}`);
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
