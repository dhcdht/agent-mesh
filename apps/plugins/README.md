# Agent Mesh 聊天软件插件

Phase 5 预留：插件框架，统一消息出口（任务进展、agent 讨论）与入口（用户干预、@agent、广播）。

## 插件接口

见 `slack/types.ts` 中的 `ChatPlugin` 接口。

## 已实现

- **slack/** — Slack 插件
  - 订阅 Coordinator SSE（`GET /api/v1/events?meshId=xxx`）
  - 接收 `task.created`、`task.updated`、`message.created` 事件
  - `onTaskUpdate`/`onMessage` 回调（当前输出到控制台）
  - 运行：`MESH_ID=xxx pnpm plugin:slack`

## 计划支持

- Slack（骨架已有）
- 飞书
- Discord

## 使用方式

插件通过 Coordinator 的 Webhook 或 SSE 订阅任务/消息事件，并推送到对应聊天平台。用户回复通过 Webhook 回调到 Coordinator。

## 接入计划

详见 [docs/chat-plugin-integration.md](../../docs/chat-plugin-integration.md)。
