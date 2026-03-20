# Agent Mesh 自举

> 用 Agent Mesh 开发 Agent Mesh：验证能力、提升效率。

## Chat 式交互

**当你在 Chat 中发 `* 消息` 或 `@agent 消息` 时，agent 会像普通 coding CLI 一样立即执行并回复。**

- 使用 ACP、Claude Code、OpenCode 等适配器的 agent 会收到消息后运行，并把回复发到 lead 收件箱
- `agent-tester`（stdin + argsOnly）只执行 `pnpm test`，不参与 chat 式回复
- 要让 agent 执行代码任务（如实现功能），仍需创建任务

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
| agent-plugin | stdin (claude -p) | 真实执行（需本机安装 Claude Code CLI） |
| agent-research | stdin (claude -p) | 同上 |

- **stdin**：`argsOnly: true` 时仅执行命令不带 task 内容，适合 `pnpm test`
- **stdin (claude -p)**：需 Claude Code CLI，在 repo.path 目录执行

修改 `config/mesh.selfhost.yaml` 中的 `cliType` 和 `cliConfig` 切换。

## 常见问题

### ACP 报错 protocolVersion / Invalid params

若看到 `protocolVersion: expected number, received undefined`，多为 OpenCode 与 ACP 适配器版本不兼容。可尝试升级 OpenCode：`npm update -g opencode` 或检查 [OpenCode 文档](https://opencode.ai/)。

### ACP 超时 180s

agent-plugin / agent-research 任务复杂时会超时。可在 `mesh.selfhost.yaml` 中调大 `cliConfig.timeoutMs`（如 300000）。

## 自举产出

- `apps/plugins/slack/` — Slack 插件骨架
- `docs/agent-coordination-patterns.md` — 需求与群组协作研究

## Chat 命令

在 Chat 中：

- `* 需求描述` — 广播给所有 agents，agent 会执行并回复（ACP/Claude Code/OpenCode）
- `@agent-tester 请运行测试` — 发给指定 agent
- `/tasks` — 查看任务
- `/task task-id` — 查看任务相关会话（含 agent 间讨论）
