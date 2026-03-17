# Agent Mesh 项目开发指南

> 供 AI Agent（Cursor、Claude Code、OpenCode 等）与人类开发者参考的项目开发流程与规范。

## 一、项目概述

Agent Mesh 是分布式多 Agent 协作系统，协调多个 AI 编程 Agent 完成跨仓库任务。详见 [README](README.md) 与 [docs/PROGRESS.md](docs/PROGRESS.md)。

## 二、开发流程

### 2.1 自举开发（推荐）

**原则**：用 Agent Mesh 开发 Agent Mesh，既验证能力又发现问题。

**步骤**：

1. **启动 Coordinator**
   ```bash
   pnpm coordinator
   ```

2. **创建任务**（通过 API 或 CLI）
   ```bash
   # 示例：创建任务
   curl -X POST http://localhost:3000/api/v1/tasks \
     -H "content-type: application/json" \
     -d '{"id":"task-xxx","meshId":"agent-mesh-dev","subject":"...","description":"...","owner":"agent-plugin","repoId":"repo-plugin"}'
   ```

3. **启动 Node**
   ```bash
   pnpm node:selfhost
   ```

4. **Chat 协作**（可选）
   ```bash
   pnpm cli chat --mesh-id agent-mesh-dev
   ```
   - `* 需求描述` 广播
   - `@agent-id 消息` 点对点
   - `/tasks` 查看任务
   - `/task task-id` 查看任务会话

5. **验证产出**：检查 agent 修改的文件、任务状态、lead 收件箱

### 2.2 任务分工（自举配置）

| Agent | cliType | 职责 | 适用任务 |
|-------|---------|------|----------|
| agent-tester | stdin | 运行测试 | 执行 `pnpm test`、验证构建 |
| agent-plugin | acp | 写代码 | 实现功能、修复 bug、重构 |
| agent-research | acp | 文档 | 补充文档、研究、设计 |

### 2.3 手动开发

当自举不适合（如调试、紧急修复）时：

1. 直接修改代码
2. `pnpm build && pnpm test` 验证
3. 按规范 commit 并更新文档

## 三、Commit 规范

### 3.1 提交信息格式

```
<type>(<scope>): <subject>

<body>
```

- **type**：`feat` | `fix` | `docs` | `refactor` | `test` | `chore`
- **scope**：`coordinator` | `node` | `cli` | `acp` | `stdin` 等
- **subject**：简短描述，不超过 50 字

### 3.2 示例

```
feat(acp): 修复 ACP 协议兼容性，支持 initialize/session/new/session/prompt

fix(cli): Chat /quit 时 readline 报错，增加 closed 标志位与 setImmediate

docs: 补充心跳机制实现要点到 PROGRESS
```

### 3.3 提交前检查

- [ ] `pnpm build` 通过
- [ ] `pnpm test` 通过
- [ ] 相关文档已更新（PROGRESS、README、docs/）

## 四、文档维护

### 4.1 必改文档

| 变更类型 | 需更新文档 |
|----------|------------|
| 新功能 | README、PROGRESS、对应 docs/ |
| API 变更 | phase1-coordinator-install.md、Swagger |
| 适配器变更 | phase3-adapters.md |
| 自举流程 | selfhost.md、AGENTS.md |

### 4.2 文档结构

```
docs/
├── PROGRESS.md           # 开发进度、问题与解决方案、后续待办
├── selfhost.md           # 自举快速开始
├── phase1-*.md           # Phase 1 相关
├── phase3-adapters.md    # 适配器说明
├── phase4-observability.md
├── agent-communication.md
├── chat-usage.md
└── plans/                # 设计文档
```

### 4.3 PROGRESS 更新

- **已完成功能**：及时补充到「二、已完成功能」
- **问题与解决**：记录到「三、遇到的问题与解决方案」
- **自举记录**：在「八、自举开发记录」记录任务与结果

## 五、后续计划（优先级）

### 5.1 高优先级

- ~~**心跳机制**~~ ✅ 已实现
- **扩缩容 API**：动态管理 Node 实例

### 5.2 中优先级

- **聊天工具接入**：Slack、飞书、Discord 等（见下节）
- **Web Dashboard**：任务看板、Agent 在线状态

### 5.3 低优先级

- **认证与授权**：API Key、JWT
- **性能优化**：批量拉取、数据库索引

## 六、聊天工具接入计划

### 6.1 目标

- 用户可在 Slack/飞书/Discord 等群聊中查看任务进展、agent 讨论
- 用户可 @agent、广播消息、干预任务

### 6.2 架构

```
Coordinator (SSE/Webhook)  →  插件  →  聊天平台
聊天平台 (用户回复)        →  Webhook  →  Coordinator
```

### 6.3 实现步骤

1. **Coordinator 事件**：新增 SSE 或 Webhook 推送任务/消息变更
2. **插件接口**：`ChatPlugin` 接口（见 `apps/plugins/slack/types.ts`）
3. **首批插件**：Slack（骨架已有）→ 飞书 → Discord
4. **文档**：`docs/chat-plugin-integration.md`

### 6.4 当前状态

- `apps/plugins/slack/` 骨架已存在
- ✅ Coordinator SSE 已实现（`GET /api/v1/events?meshId=xxx`）
- 需实现：插件订阅 SSE、推送消息到 Slack、接收用户回复回调

## 七、参考

- [自举](docs/selfhost.md)
- [开发进度](docs/PROGRESS.md)
- [Chat 使用](docs/chat-usage.md)
- [适配器](docs/phase3-adapters.md)
