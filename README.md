# Agent Mesh

> 分布式 Agent Teams：让多个 AI agent 各自负责不同代码库，通过统一协调层协同完成跨仓库任务。

[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-9+-blue)](https://pnpm.io)

## 项目介绍

Agent Mesh 是一个**分布式多 agent 协作系统**，用于协调多个 AI 编程 agent 共同完成跨代码库的开发任务。

与 Claude Code 的 Agent Teams（单一代码库、单一 CLI）不同，Agent Mesh 支持：

- **多代码库**：每个 agent 负责一个独立仓库，互不干扰
- **多 CLI 混用**：前端用 OpenCode、后端用 Claude Code、测试用 stdin 适配器，由各 repo 负责人自行配置
- **分布式部署**：Coordinator 与 Agent Node 可分布在不同机器，支持按需扩容

## 适用场景

- **微服务/多仓库项目**：前后端、多个服务分散在不同 repo，需要 agent 协同改代码
- **跨团队协作**：各团队使用不同 AI 工具（Claude Code、OpenCode 等），统一在一个 mesh 中协作
- **需求拆解与并行执行**：将大需求拆成任务，分配给不同 agent 并行处理，通过消息互通进度

## 功能特性

| 功能 | 说明 |
|------|------|
| **任务协调** | 创建任务、分配 owner、依赖关系（DAG）、状态流转 |
| **跨 agent 消息** | agent 间通过邮箱收发消息，向 lead 汇报进度 |
| **多适配器** | OpenCode（HTTP）、Claude Code（文件）、stdin（子进程） |
| **Web 控制台** | 查看任务、收件箱、Agent 在线状态，人工标记完成 |
| **CLI** | 创建 mesh、添加 repo、创建任务、查询 |
| **指标与可观测** | `/metrics` 端点、mesh 列表、任务统计 |

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│  用户 / Lead                                              │
│  Web 控制台 · CLI · 聊天插件（规划中）                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Coordinator（协调层）                                     │
│  任务 · 邮箱 · Agent 注册 · SQLite                         │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Agent Node 1 │ │ Agent Node 2 │ │ Agent Node N │
│ Repo A       │ │ Repo B       │ │ Repo C       │
│ OpenCode     │ │ Claude Code   │ │ stdin        │
└──────────────┘ └──────────────┘ └──────────────┘
```

## 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [手动启动](#手动启动)
- [CLI 使用](#cli-使用)
- [适配器](#适配器)
- [项目结构](#项目结构)
- [文档](#文档)

## 环境要求

- **Node.js** >= 20
- **pnpm** >= 9

## 快速开始

```bash
# 克隆并进入项目
git clone <repo-url> agent-mesh && cd agent-mesh

# 安装依赖
pnpm install

# 构建
pnpm build

# 运行 E2E 演示（自动启动 Coordinator + Node，约 35 秒）
pnpm demo
```

演示使用 `config/mesh.demo.yaml`（noop 适配器），创建 mesh、下发任务、Node 执行后向 lead 收件箱发送完成消息。

## 手动启动

### 1. 启动 Coordinator

```bash
pnpm coordinator
```

默认监听 `http://localhost:3000`：

- 健康检查：`GET /health`
- Web 控制台：`GET /dashboard`
- API 文档：`GET /docs`
- 指标：`GET /metrics`

### 2. 启动 Agent Node（可选）

修改 `config/mesh.example.yaml` 中的路径和 coordinator URL 后：

```bash
pnpm node
```

或指定配置：`pnpm --filter @agent-mesh/node start path/to/mesh.yaml`

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
pnpm cli task:create --id task-1 --mesh-id my-mesh \
  --subject "实现功能" --description "详细描述" \
  --owner agent-1 --repo-id repo-1

# 查看任务
pnpm cli task:list --mesh-id my-mesh

# 查看 lead 收件箱
pnpm cli inbox:list --mesh-id my-mesh --agent-id lead

# 列出节点
pnpm cli node:list [--mesh-id my-mesh]

# 下线节点
pnpm cli node:delete --id node-1

# Chat 交互模式：与 agents 交流，查看 agent 间讨论
pnpm cli chat --mesh-id my-mesh
```

## 适配器

| cliType | 说明 | 配置示例 |
|---------|------|----------|
| `opencode` | HTTP API（需 `opencode serve` + 认证） | `serverUrl`, `endpoint`, `timeoutMs` |
| `claude-code` | 写入 Claude Code inbox 文件 | `teamName`, `baseDir` |
| `stdin` | 子进程执行，prompt 作为参数 | `command`, `args`, `timeoutMs` |

**前置条件**：使用 OpenCode 适配器前，需先配置认证：
```bash
opencode providers  # 配置 API key
opencode serve --port 4096  # 启动 HTTP 服务
```

详见 [Phase 3 适配器文档](docs/phase3-adapters.md)。

## Docker 部署

```bash
# 构建镜像
docker build -t agent-mesh/coordinator .
docker build -t agent-mesh/node .

# 启动 Coordinator
docker run -d -p 3000:3000 agent-mesh/coordinator

# 启动 Node（需配置 mesh.yaml）
docker run -d -e MESH_COORDINATOR_URL=http://coordinator:3000 \
  -v ./mesh.yaml:/app/mesh.yaml agent-mesh/node

# 扩缩容
docker-compose up -d --scale node=5
```

## 项目结构

```
agent-mesh/
├── packages/
│   ├── shared/         # 类型定义、DAG 循环检测
│   ├── coordinator/    # 协调 API（Fastify + SQLite）
│   └── node/           # Agent Node 运行时 + 适配器
├── apps/
│   ├── cli/            # 命令行工具
│   └── plugins/        # 聊天插件（规划中）
├── config/
│   └── mesh.example.yaml
├── docs/               # 详细文档
└── scripts/
    └── phase1-e2e-demo.sh
```

## 技术栈

- **Runtime**: Node.js 20+
- **Coordinator**: Fastify, better-sqlite3, Zod
- **Node**: YAML 配置、多适配器
- **CLI**: Commander

## 开发

```bash
# 运行测试
pnpm test

# 开发模式（热重载）
pnpm coordinator
```

## 文档

- [AGENTS.md](AGENTS.md) — 项目开发指南（自举、Commit、文档维护、聊天工具接入）
- [Coordinator 安装与 API](docs/phase1-coordinator-install.md)
- [CLI 使用说明](docs/phase1-cli-usage.md)
- [Chat 交互模式](docs/chat-usage.md) — 与 agents 交流、查看讨论
- [Agent 通信](docs/agent-communication.md)
- [自举](docs/selfhost.md) — 用 Agent Mesh 开发 Agent Mesh
- [Node 演示](docs/phase1-node-demo.md)
- [Phase 3 适配器](docs/phase3-adapters.md)
- [Phase 4 可观测性](docs/phase4-observability.md)
- [聊天工具接入计划](docs/chat-plugin-integration.md) — Slack 插件已支持 SSE 订阅

## License

MIT
