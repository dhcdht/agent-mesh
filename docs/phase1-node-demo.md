# Phase 1 Agent Node Demo

## 目标

演示最小可运行链路：

1. 启动 Coordinator
2. 启动 Agent Node（短轮询）
3. Node 拉取待办任务并标记完成
4. Node 向 lead 发回完成消息

## 快速运行

```bash
chmod +x scripts/phase1-e2e-demo.sh
./scripts/phase1-e2e-demo.sh
```

## 运行方式（手动）

1. 启动 Coordinator

```bash
pnpm --filter @agent-mesh/coordinator dev
```

2. 启动 Node

```bash
pnpm --filter @agent-mesh/node dev ../../config/mesh.example.yaml
```

3. 创建任务（owner 必须是示例配置中的 agent id，例如 `agent-frontend`）

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H 'content-type: application/json' \
  -d '{"id":"task-manual-1","meshId":"mesh-example","subject":"manual","description":"manual","owner":"agent-frontend","repoId":"repo-frontend"}'
```

4. 查看 lead 收件箱

```bash
curl "http://localhost:3000/api/v1/messages/lead/inbox?meshId=mesh-example&unreadOnly=false"
```

## 说明

- `opencode` 类型会通过 HTTP 调用 `cliConfig.serverUrl + cliConfig.endpoint`（默认 `/run`）。
- 适配器内置超时与重试：`timeoutMs`、`retryCount`、`retryDelayMs`。
- `claude-code` 和 `stdin` 仍为占位实现（noop）。
