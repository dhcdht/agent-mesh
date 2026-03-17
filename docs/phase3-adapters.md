# Phase 3 适配器与 Web 控制台

## 适配器

| cliType | 说明 | cliConfig |
|---------|------|-----------|
| `opencode` | HTTP API 调用 | `serverUrl`, `endpoint`, `model`, `timeoutMs`, `retryCount` |
| `acp` | OpenCode ACP 子进程 | `model?`, `timeoutMs`, `messagesFilePath?`, `cwd?`（未设则用 repo.path） |
| `claude-code` | 写入 Claude Code inbox 文件 | `teamName`, `baseDir?` |
| `stdin` | 子进程执行 | `command`, `args?`, `timeoutMs`, `cwd?`, `argsOnly?` |
| 其他 | Noop（立即返回成功） | - |

### Claude Code 适配器

- 将任务写入 `~/.claude/teams/{teamName}/inboxes/{agentId}.json`
- 需与 Claude Code 同机，或通过 NFS/同步共享该路径
- 运行 Claude Code 后会自动轮询 inbox 并处理任务

### Stdin 适配器

- 默认：`args` + task 内容作为最后参数，适用于 `cmd arg1 "prompt"` 的 CLI
- `argsOnly: true`：仅执行 `command args`，不追加 task，适用于 `pnpm test` 等纯命令
- `cwd`：工作目录，未设时由 Runner 注入 repo.path
- 示例：`{ "command": "pnpm", "args": ["test"], "argsOnly": true, "timeoutMs": 120000 }`

## Web 控制台

- 访问：`http://localhost:3000/dashboard`
- 功能：输入 Mesh ID，查看任务列表、lead 收件箱，人工标记任务完成
