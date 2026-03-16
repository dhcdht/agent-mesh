# Agent Mesh 聊天软件插件

Phase 5 预留：插件框架，统一消息出口（任务进展、agent 讨论）与入口（用户干预、@agent、广播）。

## 插件接口（草案）

```typescript
interface ChatPlugin {
  name: string;
  start(config: PluginConfig): Promise<void>;
  stop(): Promise<void>;
  onTaskUpdate?(event: TaskEvent): void;
  onMessage?(event: MessageEvent): void;
  sendToUser?(userId: string, content: string): Promise<void>;
  sendBroadcast?(content: string): Promise<void>;
}
```

## 计划支持

- Slack
- 飞书
- Discord

## 使用方式

插件通过 Coordinator 的 Webhook 或 SSE 订阅任务/消息事件，并推送到对应聊天平台。用户回复通过 Webhook 回调到 Coordinator。
