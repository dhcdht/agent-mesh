# Agent Mesh 聊天软件插件

Phase 5 预留：插件框架，统一消息出口（任务进展、agent 讨论）与入口（用户干预、@agent、广播）。

## 插件接口

见 `slack/types.ts` 中的 `ChatPlugin` 接口。

## 已实现

- **slack/** — Slack 插件
  - 订阅 Coordinator SSE，推送任务/消息到 Slack 频道
  - 用户回复：SLACK_SIGNING_SECRET、SLACK_EVENTS_PORT
  - 运行：`MESH_ID=xxx pnpm plugin:slack`

- **feishu/** — 飞书插件
  - 订阅 Coordinator SSE，推送任务/消息到飞书群
  - 用户回复：FEISHU_VERIFICATION_TOKEN、FEISHU_EVENTS_PORT
  - 运行：`MESH_ID=xxx pnpm plugin:feishu`

- **discord/** — Discord 插件
  - 订阅 Coordinator SSE，推送任务/消息到 Discord 频道
  - 用户回复：需 Gateway 或 Interactions，暂未实现
  - 运行：`MESH_ID=xxx pnpm plugin:discord`

## 使用方式

插件通过 Coordinator 的 Webhook 或 SSE 订阅任务/消息事件，并推送到对应聊天平台。用户回复通过 Webhook 回调到 Coordinator。

## 接入计划

详见 [docs/chat-plugin-integration.md](../../docs/chat-plugin-integration.md)。
