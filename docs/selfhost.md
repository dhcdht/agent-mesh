# Agent Mesh 自举

> 用 Agent Mesh 开发 Agent Mesh：验证能力、提升效率。

## 快速开始

```bash
# 1. 启动 Coordinator（若未启动）
pnpm coordinator

# 2. 引导：创建 mesh、repos、任务
./scripts/bootstrap-selfhost.sh

# 3. 启动 Node（3 个 agent：tester、plugin、research）
pnpm node:selfhost

# 4. 启动 Chat 与 agents 交流
pnpm cli chat --mesh-id agent-mesh-dev
```

## 配置

- **mesh.selfhost.yaml**：3 个 agent，同路径（agent-mesh 项目），分工不同
- **bootstrap-selfhost.sh**：创建 3 个任务（测试、插件、研究）

## 任务分工

| Agent | 职责 | 任务示例 |
|-------|------|----------|
| agent-tester | 运行测试、报告失败 | 执行 pnpm test |
| agent-plugin | 实现插件 | Slack 插件骨架 |
| agent-research | 研究文档 | 需求与群组协作模式 |

## 适配器（自举默认真实执行）

| Agent | cliType | 说明 |
|-------|---------|------|
| agent-tester | stdin | 真实执行 `pnpm test`，`cwd` 由 repo.path 注入 |
| agent-plugin | acp | 真实执行（需本机安装 `opencode` 并配置 ACP） |
| agent-research | acp | 同上 |

- **stdin**：`argsOnly: true` 时仅执行命令不带 task 内容，适合 `pnpm test`
- **acp**：需 `opencode acp`，在 repo.path 目录执行

修改 `config/mesh.selfhost.yaml` 中的 `cliType` 和 `cliConfig` 切换。

## 自举产出

- `apps/plugins/slack/` — Slack 插件骨架
- `docs/agent-coordination-patterns.md` — 需求与群组协作研究

## Chat 命令

在 Chat 中：

- `* 需求描述` — 广播给所有 agents
- `@agent-tester 请运行测试` — 发给指定 agent
- `/tasks` — 查看任务
- `/task task-id` — 查看任务相关会话（含 agent 间讨论）
