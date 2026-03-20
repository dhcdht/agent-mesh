#!/usr/bin/env bash
# 与 agents 讨论下一步开发计划
# 用法：./scripts/selfhost-discuss-plan.sh
# 前置：coordinator 和 node 已启动

set -e
COORD=${MESH_COORDINATOR_URL:-http://localhost:3000}
MESH_ID=agent-mesh-dev

# 通过广播消息触发 chat 式回复（agent-plugin、agent-research 会执行并回复到群组）
MSG='我们讨论一下下一步的开发计划吧。请阅读 docs/PROGRESS.md，根据「五、后续待办」和当前实现情况，提出你的建议：哪些优先级最高、哪些可以往后排、有没有新的想法。'

echo "=== 发送讨论请求到群组 ==="
echo "消息: $MSG"
echo ""

curl -s -X POST "$COORD/api/v1/messages" \
  -H "content-type: application/json" \
  -d "{
    \"id\": \"discuss-$(date +%s)\",
    \"meshId\": \"$MESH_ID\",
    \"from\": \"lead\",
    \"to\": \"*\",
    \"type\": \"message\",
    \"payload\": { \"text\": \"$MSG\" }
  }" | jq . 2>/dev/null || echo "发送失败，请检查 Coordinator 是否运行"

echo ""
echo "消息已发送。在 Chat 中查看 agent 回复："
echo "  pnpm cli chat --mesh-id $MESH_ID"
echo ""
echo "或打开 Dashboard 查看群聊消息流。"
echo ""
