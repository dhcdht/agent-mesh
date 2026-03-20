#!/usr/bin/env bash
# 创建「回复 lead」任务，让 agents 响应你的问题
# 用法：./scripts/selfhost-ask-agents.sh "请报告你们当前的状态"

set -e
COORD=${MESH_COORDINATOR_URL:-http://localhost:3000}
MESH_ID=agent-mesh-dev
QUESTION="${1:-请向 lead 汇报你当前的状态和进展}"
TS=$(date +%s)

echo "=== 创建回复任务 ==="
echo "问题: $QUESTION"
echo ""

for repo_agent in "repo-plugin:agent-plugin" "repo-docs:agent-research"; do
  repo_id="${repo_agent%%:*}"
  agent_id="${repo_agent##*:}"
  task_id="task-ask-${agent_id}-${TS}"
  echo "[$agent_id] 创建任务 $task_id..."
  curl -s -X POST "$COORD/api/v1/tasks" \
    -H "content-type: application/json" \
    -d "{
      \"id\": \"$task_id\",
      \"meshId\": \"$MESH_ID\",
      \"subject\": \"回复 lead\",
      \"description\": \"$QUESTION\",
      \"owner\": \"$agent_id\",
      \"repoId\": \"$repo_id\"
    }" | jq -r '.id // .error' 2>/dev/null || echo "  失败"
done

echo ""
echo "任务已创建，Node 轮询时会拉取并执行。在 Chat 中用 /tasks 查看进度。"
