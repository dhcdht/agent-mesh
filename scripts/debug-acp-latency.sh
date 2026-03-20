#!/usr/bin/env bash
# 最小复现 ACP 延迟：直接跑 AcpAdapter，打各阶段耗时
# 用法：ACP_DEBUG=1 ./scripts/debug-acp-latency.sh
# 需：pnpm build、opencode 已安装

set -e
cd "$(dirname "$0")/.."

echo "=== ACP 延迟最小复现 ==="
echo "prompt: 只回一个字：好"
echo ""

export ACP_DEBUG=1
START=$(date +%s.%N)

node scripts/debug-acp-latency.mjs 2>&1

END=$(date +%s.%N)
ELAPSED=$(echo "$END - $START" | bc 2>/dev/null || echo "?")
echo ""
echo "总耗时: ${ELAPSED}s"
echo ""
echo "解读：看 [ACP:debug-agent] +Nms 的间隔。"
echo "- initialize -> session/new -> session/prompt 应在数秒内"
echo "- 若 agent_message_chunk 到 session/prompt done 间隔很长，多为 LLM 或 opencode 侧延迟"
