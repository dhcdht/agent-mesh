# 故障排查与历史结论

自举、ACP、群聊相关结论集中在此，避免多份 `docs/*-fix.md` 分散。

## OpenCode ACP 初始化很慢（~98s）

**现象**：简单 chat 也要数分钟；stderr 里 `recv result(id=0)` 在 `initialize` 上延迟约 98s。

**排查**：

```bash
ACP_DEBUG=1 ./scripts/debug-acp-latency.sh
# 或
ACP_DEBUG=1 node scripts/debug-acp-latency.mjs
```

**结论**：瓶颈在 opencode 对 `initialize` 的响应；每次新进程都会冷启动，预热两次仍慢。

**建议**：调大 `timeoutMs`（如 300000）；自举优先用 **`stdin` + Claude Code CLI**（见 `config/mesh.selfhost.yaml`）；需要协议级注入时再考虑 `acp` / `acp-pool`。

## `acp-pool` 适配器

进程复用 ACP 进程，减轻冷启动；支持 `deliverMessage` 注入。配置示例：`cliType: acp-pool`（详见 `docs/phase3-adapters.md`）。

## 群聊 / 多 Agent 协作（Runner）

曾对 `message`/`broadcast` 限制为仅 **lead** 触发回复，导致 Agent 互发不执行。已改为：任意来源的 chat 类型消息（且非 `argsOnly` stdin）都会走合成任务并 `execute`。

**当前行为**：`stdin` 对 chat 走 **`execute` 合成任务**，不依赖 `deliverMessage`；带 `deliverMessage` 的适配器仍走投递分支。

## 调试脚本（可选）

| 脚本 | 用途 |
|------|------|
| `scripts/debug-acp-latency.mjs` / `.sh` | ACP 时序 |
| `scripts/debug-acp-claude.mjs` | claude-agent-acp |
| `scripts/debug-claude-stdin.mjs` | claude -p stdin |
| `scripts/selfhost-ask-agents.sh` / `selfhost-discuss-plan.sh` | 自举场景辅助 |
