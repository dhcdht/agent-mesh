# Agent 间与群组通信

> 借鉴 [Stream0](https://github.com/risingwavelabs/stream0) 设计，实现 Agent Mesh 核心通信能力。

## 一、设计目标

- **点对点**：Agent A 可向 Agent B 发送消息
- **群组广播**：Lead 或任意 Agent 可向 mesh 内所有 Agent 广播
- **按任务聚合**：消息可关联 `taskId`，支持多轮对话（question/answer）
- **持久化**：消息持久到 Coordinator，直到被读取

## 二、消息类型（借鉴 Stream0）

| 类型 | 说明 |
|------|------|
| `request` | 任务请求 |
| `question` | 任务中澄清问题 |
| `answer` | 对 question 的回复 |
| `done` | 任务完成通知 |
| `failed` | 任务失败通知 |
| `broadcast` | 群组广播 |
| `message` | 通用自由格式 |

## 三、API

### 发送消息

```
POST /api/v1/messages
{
  "id": "uuid",
  "meshId": "mesh-1",
  "from": "agent-a",
  "to": "agent-b",     // 或 "*" / "all" 表示广播
  "type": "question",
  "payload": { "text": "API 路径是什么？" },
  "taskId": "task-1"   // 可选，关联任务
}
```

**广播**：当 `to` 为 `*` 或 `all` 时，消息存为单条（recipient=`*`），所有人通过 channel 或 inbox 可见。

### 群聊 Channel（核心）

```
GET /api/v1/meshes/:meshId/channel?since=<timestamp>
```

返回 mesh 内所有消息，按时间排序。`since` 可选，用于增量拉取。

### 收件箱（Agent 轮询）

```
GET /api/v1/messages/:agentId/inbox?meshId=mesh-1&unreadOnly=true
```

Agent 的 inbox 包含：`to="*"` 的广播消息 + `to=agentId` 的点对点消息。广播的已读状态由 `message_read` 表按 agent 记录。

### 按任务查会话历史

```
GET /api/v1/tasks/:taskId/messages?meshId=mesh-1
```

### 标记已读

```
POST /api/v1/messages/:messageId/read?agentId=<agentId>
```

广播消息（`to="*"`）需传 `agentId` 以记录该 agent 已读；点对点消息无需。

## 四、Runner 与 Adapter 集成

1. **Runner 轮询 inbox**：每个 poll 周期拉取未读消息
2. **deliverMessage**：若 Adapter 实现 `deliverMessage`，Runner 将消息投递给 CLI
3. **标记已读**：投递成功后标记已读

### Adapter 实现

| 适配器 | deliverMessage 行为 |
|--------|---------------------|
| `noop` | 直接返回 delivered |
| `claude-code` | 追加到 Claude Code inbox JSON 文件 |
| `acp` / `acp-pool` | 写入临时文件或复用会话，下次 `execute` 时注入 prompt |
| `stdin` | `message`/`broadcast` 走 **chat 路径**：合成任务调用 `execute`（非 `argsOnly`）；无 `deliverMessage` 时仍可多 Agent 协作 |
| `opencode`（HTTP 等） | 视适配器实现；未实现投递时仅记录日志 |

## 五、CLI 示例

```bash
# 点对点
pnpm cli message:send --mesh-id m1 --from agent-a --to agent-b --type question \
  --payload '{"text":"接口返回格式？"}' --task-id task-1

# 广播
pnpm cli message:send --mesh-id m1 --from lead --to '*' --type broadcast \
  --payload '{"text":"需求有更新，请同步"}'

# 按任务查会话
pnpm cli task:messages --mesh-id m1 --task-id task-1
```

## 六、典型流程

1. **Lead 创建任务** → 任务分配给 agent-a
2. **agent-a 执行中** → 向 agent-b 发 `question`（需 API 路径）
3. **agent-b 收到** → Runner 调用 `deliverMessage`，消息写入 b 的 inbox
4. **agent-b 下次执行** → ACP 适配器将消息注入 prompt，b 回复
5. **agent-b 发 `answer`** → 发到群组（`to="*"`），lead 与 agent-a 均可见
6. **agent-a 收到** → 继续任务，完成后发 `done` 到群组

**群聊**：Lead、所有 Agent 共享同一 channel，彼此可见所有消息。CLI chat 通过 `GET /meshes/:meshId/channel` 拉取群聊流。
