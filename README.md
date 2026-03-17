# Agent Mesh

分布式 Agent Teams：多个 agent 各自负责不同代码库，使用各自偏好的 CLI（Claude Code、OpenCode 等），通过统一协调层进行任务分配和跨 agent 通信。

## 环境要求

- Node.js >= 20
- pnpm >= 9

## 快速开始

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 运行 E2E 演示（自动启动 Coordinator + Mock OpenCode + Node，约 15 秒）
./scripts/phase1-e2e-demo.sh
```

## 手动启动

### 1. 启动 Coordinator

```bash
pnpm --filter @agent-mesh/coordinator dev
```

默认：`http://localhost:3000`

- 健康检查：`GET /health`
- Web 控制台：`GET /dashboard`
- API 文档：`GET /docs`

### 2. 启动 Agent Node（可选）

```bash
# 使用示例配置（需修改 config/mesh.example.yaml 中的路径和 coordinator URL）
pnpm node
# 或指定配置：pnpm --filter @agent-mesh/node start path/to/mesh.yaml
```

Node 会向 Coordinator 注册 mesh、repo、agent，并轮询任务执行。

### 3. 使用 CLI

```bash
# 创建 mesh
pnpm cli mesh:create --id my-mesh --name "My Mesh"

# 列出 mesh
pnpm cli mesh:list

# 添加 repo
pnpm cli repo:add --id repo-1 --mesh-id my-mesh --path /path/to/repo --agent-id agent-1

# 创建任务
pnpm cli task:create --id task-1 --mesh-id my-mesh --subject "实现功能" --description "详细描述" \
  --owner agent-1 --repo-id repo-1

# 查看任务
pnpm cli task:list --mesh-id my-mesh

# 查看收件箱
pnpm cli inbox:list --mesh-id my-mesh --agent-id lead
```

## 项目结构

```
agent-mesh/
├── packages/
│   ├── shared/         # 类型、DAG 循环检测
│   ├── coordinator/    # 协调 API（Fastify + SQLite）
│   └── node/           # Agent Node 运行时 + 适配器
├── apps/
│   ├── cli/            # 命令行工具
│   ├── plugins/        # 聊天插件（Phase 5 预留）
│   └── web/            # （Dashboard 内嵌于 coordinator）
├── config/
│   └── mesh.example.yaml
├── docs/               # 详细文档
└── scripts/
    └── phase1-e2e-demo.sh
```

## 适配器

| cliType      | 说明                         |
|--------------|------------------------------|
| `opencode`   | HTTP API 调用（需 opencode serve） |
| `claude-code`| 写入 Claude Code inbox 文件  |
| `stdin`      | 子进程执行，prompt 作为参数  |

## 开发

```bash
# 运行测试
pnpm test

# 开发模式（热重载）
pnpm --filter @agent-mesh/coordinator dev
```

## 文档

- [Coordinator 安装与 API](docs/phase1-coordinator-install.md)
- [CLI 使用说明](docs/phase1-cli-usage.md)
- [Node 演示](docs/phase1-node-demo.md)
- [Phase 3 适配器](docs/phase3-adapters.md)
- [Phase 4 可观测性](docs/phase4-observability.md)
