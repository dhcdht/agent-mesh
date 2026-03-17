/**
 * Slack 插件骨架
 * 自举任务产出：agent-plugin
 *
 * 连接 Coordinator 的占位，后续实现：
 * - 轮询 /api/v1/tasks、/api/v1/messages 或 SSE
 * - 推送到 Slack channel
 * - 接收 Slack 消息回调到 Coordinator
 */

import type { ChatPlugin, PluginConfig, TaskEvent, MessageEvent } from "./types.js";

export class SlackPlugin implements ChatPlugin {
  name = "slack";
  private config: PluginConfig | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async start(config: PluginConfig): Promise<void> {
    this.config = config;
    console.log(`[slack] plugin started, coordinator: ${config.coordinatorUrl}`);
    // TODO: 连接 Coordinator，订阅任务/消息事件
    // 占位：轮询或 SSE
    this.pollTimer = setInterval(() => this.pollCoordinator(), 10000);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.config = null;
    console.log("[slack] plugin stopped");
  }

  onTaskUpdate?(event: TaskEvent): void {
    // TODO: 推送到 Slack
    console.log(`[slack] task update: ${event.taskId} -> ${event.status}`);
  }

  onMessage?(event: MessageEvent): void {
    // TODO: 推送到 Slack
    console.log(`[slack] message: ${event.from} -> ${event.to} (${event.type})`);
  }

  private async pollCoordinator(): Promise<void> {
    if (!this.config) return;
    try {
      const res = await fetch(`${this.config.coordinatorUrl}/api/v1/meshes`, {
        headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as { items?: unknown[] };
        if (data.items && data.items.length > 0) {
          // 占位：有 mesh 时可选拉取任务/消息
        }
      }
    } catch {
      // 静默忽略
    }
  }
}
