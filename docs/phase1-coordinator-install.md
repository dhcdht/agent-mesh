# Phase 1 Coordinator 安装与运行

本文档对应当前已实现的 Phase 1 Coordinator MVP（Fastify + SQLite + REST API）。

## 1. 环境要求

- Node.js >= 20
- pnpm >= 9

## 2. 安装依赖

在仓库根目录执行：

```bash
pnpm install
```

## 3. 构建

```bash
pnpm --filter @agent-mesh/coordinator build
```

说明：`@agent-mesh/coordinator` 会在构建前自动构建 `@agent-mesh/shared`。

## 4. 启动开发服务

```bash
pnpm --filter @agent-mesh/coordinator dev
```

默认配置：

- `HOST=0.0.0.0`
- `PORT=3000`
- `COORDINATOR_DB_PATH=./agent-mesh.db`

示例（自定义端口和数据库路径）：

```bash
PORT=3100 COORDINATOR_DB_PATH=./data/coordinator.db pnpm --filter @agent-mesh/coordinator dev
```

启用 API Key 认证（可选）：

```bash
MESH_API_KEY=your-secret-key pnpm --filter @agent-mesh/coordinator dev
```

启用后，所有 `/api/v1/*` 请求需携带 `Authorization: Bearer your-secret-key`。

## 5. 运行测试

```bash
pnpm --filter @agent-mesh/coordinator test
```

当前测试覆盖：

- 任务依赖循环检测（DAG）
- 消息收件箱与已读流转

## 6. API 入口

- 健康检查：`GET /health`
- 指标：`GET /metrics`（meshes/tasks/agents/messages 数量）
- Swagger UI：`GET /docs`
- Web 控制台（人工辅助模式）：`GET /dashboard`
- 业务接口前缀：`/api/v1`

## 7. MVP 已实现接口

- Mesh
  - `GET /api/v1/meshes` — 列表
  - `POST /api/v1/meshes`
  - `GET /api/v1/meshes/:meshId`
  - `PATCH /api/v1/meshes/:meshId`
  - `DELETE /api/v1/meshes/:meshId`
- Repo
  - `POST /api/v1/repos`
  - `GET /api/v1/meshes/:meshId/repos`
- Agent
  - `POST /api/v1/agents/register`
  - `GET /api/v1/agents?meshId=<id>&nodeId=<optional>`（返回 `nodeOnline`）
- Node
  - `POST /api/v1/nodes/:nodeId/heartbeat`（body: `{ meshId }`）
  - `GET /api/v1/nodes?meshId=<optional>` — 列出节点及状态
  - `DELETE /api/v1/nodes/:nodeId` — 下线节点（从注册表移除）
- Task
  - `POST /api/v1/tasks`
  - `PATCH /api/v1/tasks/:taskId`
  - `GET /api/v1/tasks?meshId=<id>&owner=<optional>&status=<optional>`
- Message
  - `POST /api/v1/messages`
  - `GET /api/v1/messages/:agentId/inbox?meshId=<id>&unreadOnly=true|false`
  - `POST /api/v1/messages/:messageId/read`
- Events（SSE）
  - `GET /api/v1/events?meshId=<id>` — 推送 `task.created`、`task.updated`、`message.created`

## 8. 快速验证示例

```bash
curl -X POST http://localhost:3000/api/v1/meshes \
  -H 'content-type: application/json' \
  -d '{"id":"mesh-1","name":"mesh one"}'

curl -X POST http://localhost:3000/api/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"id":"task-1","meshId":"mesh-1","subject":"init","description":"init","owner":"agent-a","repoId":"repo-a"}'
```
