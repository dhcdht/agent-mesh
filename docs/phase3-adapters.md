# Phase 3 适配器与 Web 控制台

## 适配器

| cliType | 说明 | cliConfig |
|---------|------|-----------|
| `opencode` | HTTP API 调用 | `serverUrl`, `endpoint`, `model`, `timeoutMs`, `retryCount` |
| `claude-code` | 写入 Claude Code inbox 文件 | `teamName`, `baseDir?` |
| `stdin` | 子进程执行，prompt 作为最后参数 | `command`, `args?`, `timeoutMs` |
| 其他 | Noop（立即返回成功） | - |

### Claude Code 适配器

- 将任务写入 `~/.claude/teams/{teamName}/inboxes/{agentId}.json`
- 需与 Claude Code 同机，或通过 NFS/同步共享该路径
- 运行 Claude Code 后会自动轮询 inbox 并处理任务

### Stdin 适配器

- 适用于支持 `cmd arg1 arg2 "prompt"` 的 CLI
- 示例：`opencode run "task subject and description"`
- 配置：`{ "command": "opencode", "args": ["run"], "timeoutMs": 60000 }`

## Web 控制台

- 访问：`http://localhost:3000/dashboard`
- 功能：输入 Mesh ID，查看任务列表、lead 收件箱，人工标记任务完成
