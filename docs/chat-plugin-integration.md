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

### Step 2：插件接口 ✅ Slack 已实现 SSE 订阅与推送

Slack 插件已实现：
- 订阅 `GET /api/v1/events?meshId=xxx`
- 解析 `task.created`、`task.updated`、`message.created`
- 回调 `onTaskUpdate`、`onMessage`，并调用 `chat.postMessage` 推送到 Slack 频道
- 配置 `SLACK_TOKEN`、`SLACK_CHANNEL` 后自动推送；未配置时仅控制台输出
- 运行：`MESH_ID=xxx SLACK_TOKEN=xoxb-xxx SLACK_CHANNEL=C01234567 pnpm plugin:slack`

见 `apps/plugins/slack/types.ts` 中 `ChatPlugin`：

```ts
interface ChatPlugin {
  start(config: PluginConfig): Promise<void>;
  stop(): Promise<void>;
  onTaskUpdate?(task: Task): void;
  onMessage?(message: Message): void;
}
```

✅ 用户回复：插件 HTTP 服务接收 Slack Events，解析后转发到 Coordinator。

### Step 3：Slack 推送与回调 ✅ 已实现

1. **Slack App**：创建 App、配置 Bot Token、Event Subscriptions
2. **入站**：配置 `SLACK_SIGNING_SECRET`、`SLACK_EVENTS_PORT`，插件启动 HTTP 服务；Slack Event Subscriptions Request URL 设为 `https://<公网>/slack/events`
3. **出站**：`chat.postMessage` 推送任务/消息到频道（SLACK_TOKEN、SLACK_CHANNEL）
4. **回调**：用户消息 → 插件解析 `@agent 消息` / `* 消息` → `POST /api/v1/messages` 到 Coordinator

运行示例（含用户回复）：
```bash
MESH_ID=xxx SLACK_TOKEN=xoxb-xxx SLACK_CHANNEL=C01234567 \
SLACK_SIGNING_SECRET=xxx SLACK_EVENTS_PORT=4097 \
pnpm plugin:slack
```
需将 `https://<ngrok或公网>:4097/slack/events` 配置为 Slack App 的 Event Subscriptions Request URL。

### Step 4：飞书、Discord

- 复用 `ChatPlugin` 接口
- **飞书**：已实现 `apps/plugins/feishu/`，SSE 订阅、消息推送、用户回复（需 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_CHAT_ID、FEISHU_VERIFICATION_TOKEN、FEISHU_EVENTS_PORT）
- **Discord**：已实现 `apps/plugins/discord/`，SSE 订阅、消息推送（DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID）。用户回复需 Gateway 或 Interactions，暂未实现

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

### 飞书插件运行

```bash
MESH_ID=xxx COORDINATOR_URL=http://localhost:3000 \
FEISHU_APP_ID=xxx FEISHU_APP_SECRET=xxx FEISHU_CHAT_ID=oc_xxx \
FEISHU_VERIFICATION_TOKEN=xxx FEISHU_EVENTS_PORT=4098 \
pnpm plugin:feishu
```

飞书配置：创建自建应用 → 开启机器人 → 权限：im:message、im:message:send_as_bot → 事件订阅「接收消息 v2.0」→ 请求 URL 配置为 `https://<公网>:4098/feishu/events`

### Discord 插件运行

```bash
MESH_ID=xxx COORDINATOR_URL=http://localhost:3000 \
DISCORD_BOT_TOKEN=xxx DISCORD_CHANNEL_ID=123456789 \
pnpm plugin:discord
```

Discord 配置：创建应用 → 添加 Bot → 邀请到服务器 → 获取 Bot Token、频道 ID（开发者模式开启后右键频道复制）

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
