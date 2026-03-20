# Agent Mesh 开发进度文档

## 当前状态总结（2025-03）

### 进展
- **群聊协作修复**：移除 `runner.ts` 中 `isFromLead` 限制，所有 agent 间的 `message`/`broadcast` 都会触发实时回复，实现真正的多 agent 协作
- **自举模式可用**：agent-plugin / agent-research 使用 `stdin + claude -p`，配合修复后的 runner，支持实时群聊和协作
- **ACP 进程池**：实现 `acp-pool` 适配器作为备选方案（当 ACP 实现可用时）
- **群聊与 CLI Chat**：广播消息、channel API、`listChannel` 已实现

### 已知问题
- **opencode acp 不可用**：initialize ~98s 后返回 "Internal error"，无法使用
- **当前方案**：使用 `stdin + claude -p`，通过 runner 的实时触发机制实现协作（无需 ACP 的 deliverMessage）

### 调试与排障
- 集中说明见 [docs/troubleshooting.md](troubleshooting.md)（ACP 延迟、`acp-pool`、Runner 群聊行为、调试脚本索引）

---

## 一、项目核心定位

Agent Mesh 是一个**分布式多 AI Agent 协作系统**，专注于解决多个 AI 编程 Agent 之间的任务协调与通信问题。

- **核心职责**：任务分发、消息路由、Agent 注册/发现、扩容管理
- **不负责**：Agent 内部的推理和工具执行（交给外部 Agent 如 OpenCode、Claude Code）
- **价值主张**：让用户可以用统一的方式管理多个代码库、多个 Agent、多个任务

## 二、已完成功能

### 1. 核心架构
- **Coordinator**：Fastify + SQLite，提供 REST API
- **Agent Node**：轮询任务执行，支持多适配器
- **消息系统**：基于邮箱的异步消息，支持已读回执、**Agent 间通信**、**群组广播**、**按任务聚合会话**（借鉴 [Stream0](https://github.com/risingwavelabs/stream0)）

### 2. 心跳与事件
- **心跳机制**：Node 定期上报，Coordinator `nodes` 表，`GET /agents` 返回 `nodeOnline`
- **SSE 事件**：`GET /api/v1/events?meshId=xxx` 推送任务/消息变更，供聊天插件订阅

### 3. 适配器实现
| 适配器 | 类型 | 说明 |
|--------|------|------|
| `noop` | 模拟 | 仅打印日志，用于测试 |
| `acp` | ACP 协议 | 每次任务新进程，支持自动权限审批、**deliverMessage**。opencode 冷启动 ~98s |
| `acp-pool` | ACP 进程池 | **复用进程**，首次 ~98s，后续任务快速执行，支持 **deliverMessage**（实时消息注入） |
| `claude-code` | 文件 | 写入 Claude Code inbox，支持 **deliverMessage**（agent 间消息） |
| `opencode` | HTTP | OpenCode serve API |
| `opencode-cli` | 子进程 | opencode run 命令 |
| `stdin` | 子进程 | 通过 stdin 传递 prompt，命令作为参数 |

### 4. Agent 间与群组通信（核心能力）

借鉴 [Stream0](https://github.com/risingwavelabs/stream0) 设计，实现：

| 能力 | 说明 |
|------|------|
| **点对点消息** | Agent A → Agent B，通过 inbox 投递，Runner 调用 `adapter.deliverMessage()` |
| **群组广播** | `to: "*"` 或 `to: "all"` 时，消息 fan-out 到 mesh 内所有 agent |
| **按任务聚合** | 消息支持 `taskId`，`GET /tasks/:taskId/messages` 获取任务相关会话历史 |
| **标准消息类型** | request / question / answer / done / failed / broadcast / message |
| **deliverMessage** | Adapter 可选实现，Runner 将 inbox 消息投递给 CLI（Claude Code 写文件、ACP 注入下次 prompt） |

### 5. CLI 命令（共 16 个）
```
Chat 交互：
  chat --mesh-id <meshId>     # 与 agents 交流，查看讨论与进展

Mesh 管理：
  mesh:create --id <id> --name <name>
  mesh:list
  mesh:delete --id <id>

Repo 管理：
  repo:add --id <id> --mesh-id <meshId> --path <path> --agent-id <agentId>
  repo:list --mesh-id <meshId>

Agent / Node 管理：
  agent:list --mesh-id <meshId> [--node-id <nodeId>]
  node:list [--mesh-id <meshId>]   # 列出节点
  node:delete --id <nodeId>        # 下线节点

任务管理：
  task:create --id <id> --mesh-id <meshId> --subject <subject> --description <desc> --owner <owner> --repo-id <repoId>
  task:update --id <id> --status <status>
  task:list --mesh-id <meshId> [--owner <owner>] [--status <status>]
  task:messages --mesh-id <meshId> --task-id <taskId>   # 按任务查会话历史

消息系统：
  message:send --mesh-id <meshId> --from <from> --to <to> --type <type> --payload <json> [--task-id <taskId>]
  inbox:list --mesh-id <meshId> --agent-id <agentId> [--unread-only]
```

### 6. Docker 部署
```bash
# 构建镜像
docker build -t agent-mesh/coordinator .
docker build -t agent-mesh/node .

# 启动（单节点）
docker-compose up -d

# 扩容
docker-compose up -d --scale node=5
```

### 7. Web Dashboard
- 任务列表、收件箱、人工标记完成
- **Agents 列表**：展示 `nodeOnline`（🟢 在线 / 🔴 离线）
- **Nodes 列表**：节点状态、最后心跳、下线按钮
- **API Key 支持**：启用认证时可输入 Key 访问

### 8. 聊天插件
- **Slack**：SSE 订阅、推送、用户回复（SLACK_SIGNING_SECRET、SLACK_EVENTS_PORT）
- **飞书**：SSE 订阅、推送、用户回复（FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_CHAT_ID、FEISHU_VERIFICATION_TOKEN、FEISHU_EVENTS_PORT）
- **Discord**：SSE 订阅、推送（DISCORD_BOT_TOKEN、DISCORD_CHANNEL_ID）。用户回复需 Gateway/Interactions，暂未实现

### 9. 测试通过
- 单元测试全部通过（含 broadcast、task:messages、nodes 列表）
- E2E 演示脚本可用（`pnpm demo`，使用 config/mesh.demo.yaml + noop 适配器）

### 10. 自举（Self-Host）
- **config/mesh.selfhost.yaml**：3 agent（tester、plugin、research）协作
- **scripts/bootstrap-selfhost.sh**：引导脚本
- **pnpm node:selfhost**：启动自举 Node
- **产出**：Slack 插件骨架、agent-coordination-patterns.md
- **真实执行**：
  - agent-tester 用 stdin 执行 `pnpm test`
  - agent-plugin/research 用 **stdin + claude -p**，通过 runner 实时触发实现群聊协作
  - 所有 agent 间的 message/broadcast 都会触发实时回复，无需 ACP 的 deliverMessage
  - `cwd` 由 repo.path 自动注入

## 三、遇到的问题与解决方案

### 问题 1：OpenCode HTTP API 不执行工具
**现象**：`opencode serve` 的 `/session/:id/message` 端点只接收消息，不触发实际的工具执行（如创建文件）。

**原因分析**：
- OpenCode 的 serve 模式是为 TUI/Web 客户端设计的消息中转层
- 工具执行需要 TUI 界面或 ACP 协议
- HTTP API 返回 200 但 agent 没有真正处理消息

**解决方案**：
- 实现 `AcpAdapter`，使用 `opencode acp` 命令
- ACP 是行业标准协议，支持完整的 agent 交互流程
- 通过 `session/request_permission` 实现自动权限审批

### 问题 1b：ACP 协议兼容性（已修复）
**现象**：`protocolVersion required`、`sendMessage method not found`。

**原因**：旧实现使用了错误的协议：`initialize` 未传 `protocolVersion`，且使用了不存在的 `sendMessage` 方法。

**解决方案**：按 [ACP 规范](https://agentclientprotocol.com/) 实现完整流程：
1. `initialize`：传 `protocolVersion: 1`、`clientCapabilities`、`clientInfo`
2. `session/new`：传 `cwd`、`mcpServers`，获取 `sessionId`
3. `session/prompt`：传 `sessionId`、`prompt: [{type:"text", text: "..."}]`
4. `session/request_permission`：自动响应 `outcome: "selected", optionId: "allow-once"`
5. 过滤 stdout 中的 OSC 转义序列（opencode 已知问题）

### 问题 1c：ACP chat 回复混入协议输出（已修复）
**现象**：agent-plugin 的 chat 式回复发到群组时，payload 是 raw JSON-RPC 协议流而非可读文本。

**原因**：`summary` 使用 `out.slice(-500)`（stdout 最后 500 字符），而 stdout 是完整 JSON-RPC 流。

**解决方案**：解析 `session/update` 通知，提取 `sessionUpdate: "agent_message_chunk"` 的 `content.text`，拼接成 summary；无提取时回退到 stdout 尾部。

### 问题 1d：ACP 180s 超时实为 lineBuffer 未 flush（已修复）
**现象**：agent 有输出（agent_message_chunk）但最终报 "ACP adapter timed out"，看似无回复。

**原因**：按 `\n` 分行解析 JSON-RPC，最后一条若不以换行结尾会留在 `lineBuffer`，永不处理。`session/prompt` 的响应（id 2）常为最后一条，导致永远等不到 `finish("success")`。

**解决方案**：在 timeout 和 `proc.on("close")` 时调用 `flushLineBuffer()`，处理剩余 buffer 再决定 resolve/reject。

### 问题 1e：opencode acp initialize ~98s 延迟（已修复）
**现象**：agent-plugin 一句简单 chat 回复耗时 4.5 分钟；根因为 opencode 对 `initialize` 的响应约 98 秒。

**原因**：opencode 冷启动时 initialize 阶段做较重操作；预热无效，每次 spawn 新进程都冷启动。

**解决方案**：实现 **ACP 进程池**（`acp-pool` 适配器）。首次初始化 ~98s，后续任务复用同一进程，无需重新初始化。支持真正的 deliverMessage（实时消息注入）。详见 `packages/node/src/adapters/acp-pool.ts`。

### 问题 2：删除 DAG 任务依赖管理
**原始设计**：Task 有 `blockedBy` 和 `blocks` 字段，用于表示任务依赖关系。

**反思**：让系统管理任务依赖违反了 Agent Mesh 的核心定位：
- Agent 应该自己协商任务拆分和顺序
- 系统只提供通信基础设施，不做业务逻辑

**解决方案**：
- 移除 `blockedBy` 和 `blocks` 字段
- 删除 DAG 循环检测逻辑
- 让 Agent 通过消息自行协商

### 问题 3：Coordinator 数据库路径
**现象**：开发时数据库文件创建位置与预期不符。

**解决方案**：
- 使用环境变量 `COORDINATOR_DB_PATH` 指定绝对路径
- 或直接指定路径启动：`COORDINATOR_DB_PATH=/path/to/db pnpm coordinator`

## 四、当前架构图

```
                    ┌─────────────────────────────────────────────────┐
                    │              Agent Mesh 系统                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│  │   Mesh A    │     │   Mesh B    │     │   Mesh C    │          │
│  │  (Coordinator + Nodes)  │          │          │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘          │
│         │                   │                   │                   │
│         └───────────────────┼───────────────────┘                   │
│                             │                                       │
│                    REST API /messages                              │
│                             │                                       │
│                    ┌────────▼────────┐                             │
│                    │   Agent Node    │                             │
│                    │  (任意数量的 Node) │                           │
│                    └────────┬────────┘                             │
│                             │                                       │
│                             ▼                                       │
│                    ┌─────────────────┐                             │
│                    │   CLI 适配器     │                             │
│                    │  opencode acp   │                             │
│                    │ claude-code     │                             │
│                    │ stdin           │                             │
│                    └─────────────────┘                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 五、后续待办

### 5.1 高优先级

#### 心跳机制 ✅ 已实现
- Node 每轮询周期发送心跳到 `POST /api/v1/nodes/:nodeId/heartbeat`（body: `{ meshId }`）
- Coordinator `nodes` 表记录 `last_heartbeat_at`，后台每 30 秒扫描，超过 2 分钟未心跳则 `status=offline`
- `GET /agents` 返回 `nodeOnline: boolean`（有 nodeId 的 agent 根据 nodes 表判断）


#### 扩缩容 API
- ✅ `GET /api/v1/nodes?meshId=<optional>` 列出节点及状态
- ✅ `DELETE /api/v1/nodes/:nodeId` 下线节点（从注册表移除）
- ✅ CLI `node:list [--mesh-id <meshId>]`、`node:delete --id <nodeId>`
- **TODO**：`POST /api/v1/nodes/scale?replicas=5`（需编排层支持）

### 5.2 中优先级

#### 消息已读回执
- ~~`POST /api/v1/messages/:messageId/read`~~ ✅ 已实现
- Agent Node 读取 inbox 后自动标记已读 ✅

#### Claude Code 适配器完善
当前 `claude-code` 适配器需要 Claude Code TUI 正在运行。

**TODO**：
- 测试 Claude Code inbox 文件写入
- 验证 Agent 是否会自动读取并执行

#### Web Dashboard ✅ 已实现
- Mesh 选择、Agents 列表（nodeOnline）、Nodes 列表（下线按钮）
- 任务列表、收件箱、人工标记完成
- API Key 输入（启用认证时）

### 5.3 中高优先级（已提上日程）

#### Phase 5：聊天工具接入
**目标**：用户可在 Slack/飞书/Discord 群聊中查看任务进展、@agent、广播消息。

**当前**：
- ✅ Coordinator SSE：`GET /api/v1/events?meshId=xxx` 推送 `task.created`、`task.updated`、`message.created`
- ✅ Slack 插件：订阅 SSE、接收事件并回调 `onTaskUpdate`/`onMessage`
- ✅ Slack 推送：配置 `SLACK_TOKEN`、`SLACK_CHANNEL` 后通过 `chat.postMessage` 推送到 Slack 频道
- 运行：`MESH_ID=xxx SLACK_TOKEN=xoxb-xxx SLACK_CHANNEL=C01234567 pnpm plugin:slack`

- ✅ **用户回复回调**：配置 `SLACK_SIGNING_SECRET`、`SLACK_EVENTS_PORT` 后，插件启动 HTTP 服务接收 Slack Events；用户消息转发到 Coordinator（`@agent 消息` 点对点，`* 消息` 或普通消息广播）
- **TODO**：飞书、Discord 插件（复用接口）

详见 [AGENTS.md](../AGENTS.md) 六、聊天工具接入计划。

#### 认证与授权
- ✅ **API Key 认证**：设置环境变量 `MESH_API_KEY` 后，所有 `/api/v1/*` 请求需携带 `Authorization: Bearer <key>`
- CLI、Node、Dashboard 均支持通过配置传入 API Key
- **TODO**：角色权限控制

#### 性能优化
- **TODO**：批量任务拉取
- ✅ 数据库索引：tasks(mesh_id,status)、tasks(mesh_id,owner)、messages(mesh_id,recipient)、messages(mesh_id,task_id)、nodes(mesh_id)、agents(mesh_id)

## 六、快速开始

```bash
# 1. 安装依赖
pnpm install && pnpm build

# 2. 启动 Coordinator
COORDINATOR_DB_PATH=$(pwd)/agent-mesh.db pnpm coordinator

# 3. 另起终端，配置并启动 Node
cat > mesh.yaml <<EOF
mesh:
  id: dev-mesh
  name: Development Mesh
repos:
  - id: my-repo
    path: /path/to/your/project
    agent:
      id: agent-1
      name: Dev Agent
      cliType: stdin
      cliConfig:
        command: claude
        args: ["-p"]
        timeoutMs: 180000
coordinator:
  url: http://localhost:3000
node:
  id: node-1
  pollIntervalMs: 5000
EOF

pnpm --filter @agent-mesh/node dev mesh.yaml

# 4. 通过 CLI 创建任务
pnpm cli mesh:create --id test-mesh --name "Test Mesh"
pnpm cli repo:add --id repo-1 --mesh-id test-mesh --path /path/to/repo --agent-id agent-1
pnpm cli task:create --id task-1 --mesh-id test-mesh \
  --subject "Create test file" \
  --description "Create a file hello.txt with content hello" \
  --owner agent-1 --repo-id repo-1
```

## 七、参考文档

- [Stream0](https://github.com/risingwavelabs/stream0) — Agent 通信基础设施（inbox、task-based conversation、消息类型）
- [ACP 协议规范](https://agentclientprotocol.com/protocol/prompt-turn.md)
- [OpenCode Server API](https://opencode.ai/docs/server/)
- [OpenCode Permissions](https://opencode.ai/docs/permissions/)

---

## 八、自举开发记录（2025-03-16）

### 本轮自举任务与结果

| 任务 | Agent | 结果 | 说明 |
|------|-------|------|------|
| task-chat-fix | agent-plugin | ✅ | 修复 Chat /quit 时 readline 报错（closed 标志位 + setImmediate） |
| task-heartbeat-doc | agent-research | ✅ | 补充心跳机制实现要点（手动补充） |
| task-test-verify | agent-tester | ✅ | stdin 执行 pnpm test 通过 |

### 发现与修复

- **Chat /quit**：`closed` 标志位 + `setImmediate` 延迟 prompt，避免 rl.close() 后再次调用 rl.question
- **ACP 超时**：opencode acp 的 initialize ~98s，导致整体超时；**已规避**：改用 claude -p + stdin
- **agent-plugin 完成 task-chat-fix**：ACP 适配器修复后 agent-plugin 可正常执行代码任务

### 近期变更（2025-03）

- agent-plugin、agent-research 从 opencode acp 切换为 claude -p（stdin 适配器）
- ACP 适配器支持可配置 `command`/`args`
- 新增 `scripts/debug-claude-stdin.mjs` 用于验证 claude -p 延迟

---

*文档更新日期：2025-03-18*