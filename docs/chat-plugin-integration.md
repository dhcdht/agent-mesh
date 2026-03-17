# 聊天工具接入计划

> Phase 5：让用户可在 Slack、飞书、Discord 等群聊中与 Agent Mesh 交互。

## 一、目标

- **查看**：任务进展、agent 间讨论、完成/失败消息
- **干预**：@ 指定 agent、广播给所有 agent、澄清需求
- **入口**：群聊中自然交互，无需切到 CLI

## 二、架构

```
┌─────────────────┐     SSE/Webhook      ┌─────────────┐      API       ┌──────────┐
│  Coordinator    │ ──────────────────→ │   Plugin    │ ─────────────→ │  Slack   │
│  任务/消息变更   │                      │  (Node 进程) │                │ 飞书等   │
└─────────────────┘                      └─────────────┘                └──────────┘
        ↑                                        │                              │
        │                                        │        用户回复 Webhook       │
        └──────────────────────────────────────┴──────────────────────────────┘
```

## 三、实现步骤

### Step 1：Coordinator 事件推送 ✅ 已实现

**SSE**：`GET /api/v1/events?meshId=xxx` 已实现

- 推送事件类型：`task.created`、`task.updated`、`message.created`
- 插件订阅后转发到聊天平台

**方案 B：Webhook**（可选）

- 插件配置 Webhook URL 到 Coordinator
- Coordinator 在任务/消息变更时 POST 到 Webhook
- 需管理 Webhook 注册表

### Step 2：插件接口 ✅ Slack 已实现 SSE 订阅

Slack 插件已实现：
- 订阅 `GET /api/v1/events?meshId=xxx`
- 解析 `task.created`、`task.updated`、`message.created`
- 回调 `onTaskUpdate`、`onMessage`（当前控制台输出）
- 运行：`MESH_ID=xxx pnpm plugin:slack`

见 `apps/plugins/slack/types.ts` 中 `ChatPlugin`：

```ts
interface ChatPlugin {
  start(config: PluginConfig): Promise<void>;
  stop(): Promise<void>;
  onTaskUpdate?(task: Task): void;
  onMessage?(message: Message): void;
}
```

扩展：支持 `onUserReply(channelId, userId, text)` 回调，将用户消息转发到 Coordinator。

### Step 3：Slack 推送与回调

1. **Slack App**：创建 App、配置 Bot Token、Event Subscriptions
2. **入站**：接收 `message` 事件，解析 @mention、命令
3. **出站**：`chat.postMessage` 推送任务/消息到频道
4. **回调**：用户回复 → 解析 → `POST /api/v1/messages` 到 Coordinator

### Step 4：飞书、Discord

- 复用 `ChatPlugin` 接口
- 各平台 API 不同，分别实现 `apps/plugins/feishu/`、`apps/plugins/discord/`

## 四、配置示例

```yaml
# config/plugins.yaml（未来）
plugins:
  - type: slack
    config:
      token: xoxb-xxx
      channelId: C01234567
      meshId: agent-mesh-dev
  - type: feishu
    config:
      appId: xxx
      appSecret: xxx
      chatId: oc_xxx
      meshId: agent-mesh-dev
```

## 五、消息格式（推送到群聊）

| 事件 | 示例 |
|------|------|
| 任务完成 | `[agent-tester] 完成 task-test: 运行测试` |
| 任务失败 | `[agent-research] 失败 task-xxx: ACP timeout` |
| 用户 @agent | `@agent-plugin 请实现 xxx` → 转发为 message |
| 用户广播 | `* 大家注意，需求有更新` → 转发为 broadcast |

## 六、依赖

- ✅ Coordinator SSE 已实现
- 各平台需申请 App/Bot 凭证
- 插件可独立进程运行，或集成到 Coordinator

## 七、参考

- [Slack API](https://api.slack.com/)
- [飞书开放平台](https://open.feishu.cn/)
- [Discord Developer](https://discord.com/developers/docs/)
- [AGENTS.md](../AGENTS.md) 六、聊天工具接入计划
