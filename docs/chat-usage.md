# Chat 交互模式

> 让用户以对话方式与 agents 交流，查看 agent 间沟通与任务进展。

## 启动

```bash
pnpm cli chat --mesh-id <mesh-id>
```

或指定 Coordinator 地址：

```bash
pnpm cli chat --mesh-id my-mesh -c http://localhost:3000
```

## 功能

| 能力 | 说明 |
|------|------|
| **收 lead 收件箱** | 自动轮询（约 4 秒），agents 发给你的消息会实时显示 |
| **发消息给 agents** | 支持点对点、广播 |
| **查看 agent 间讨论** | 通过 `/task <id>` 查看任务相关会话（含 agent 互发） |
| **任务与 agent 列表** | `/tasks`、`/agents` 快速查看 |

## 命令

| 输入 | 说明 |
|------|------|
| `@agent-id 消息` | 发给指定 agent |
| `* 消息` | 广播给所有 agents |
| `消息` | 默认广播 |

**Chat 式回复**：使用 ACP、Claude Code、OpenCode 等适配器的 agent 收到消息后会立即执行并回复到 lead 收件箱。
| `/task <task-id>` | 查看任务相关会话（含 agent 间 question/answer） |
| `/tasks` | 列出任务 |
| `/agents` | 列出 agents |
| `/help`, `?` | 帮助 |
| `/quit`, `/exit` | 退出 |

## 典型流程

1. 启动 Coordinator 和 Node
2. 创建 mesh、repo、任务
3. 运行 `pnpm cli chat --mesh-id my-mesh`
4. 输入需求或指令（广播给 agents，agent 会执行并回复）
5. 等待 agents 执行任务，收件箱会收到 `done`/`failed` 等消息
6. 需要澄清时：`@agent-frontend 请用 REST 风格`
7. 查看 agent 间讨论：`/task task-1`
8. 收到最终结果后 `/quit` 退出

## 后续增强（规划）

- Web 版 Chat（Dashboard 内嵌）
- 聊天软件插件（Slack、飞书）— Phase 5
- 流式输出、消息高亮
