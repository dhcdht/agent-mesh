#!/usr/bin/env bash
# Agent Mesh 自举引导脚本
# 创建 mesh、repos、agents、初始任务，供 Node 执行

set -e
COORD=${MESH_COORDINATOR_URL:-http://localhost:3000}
MESH_ID=agent-mesh-dev
PROJECT_PATH="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Agent Mesh 自举引导 ==="
echo "Coordinator: $COORD"
echo "Project: $PROJECT_PATH"
echo ""

# 1. 创建 mesh
echo "[1/5] 创建 mesh..."
curl -s -X POST "$COORD/api/v1/meshes" \
  -H "content-type: application/json" \
  -d "{\"id\":\"$MESH_ID\",\"name\":\"Agent Mesh 自举开发\"}" | jq . 2>/dev/null || true

# 2. 添加 repos（3 个 agent，同路径不同职责；Node 启动时也会 ensureRepo，此处可省略）
echo "[2/5] 添加 repos（Node 启动时会自动注册，此处预创建便于先建任务）..."
for repo_agent in "repo-test:agent-tester" "repo-plugin:agent-plugin" "repo-docs:agent-research"; do
  repo_id="${repo_agent%%:*}"
  agent_id="${repo_agent##*:}"
  curl -s -X POST "$COORD/api/v1/repos" \
    -H "content-type: application/json" \
    -d "{\"id\":\"$repo_id\",\"meshId\":\"$MESH_ID\",\"path\":\"$PROJECT_PATH\",\"agentId\":\"$agent_id\"}" 2>/dev/null | jq . 2>/dev/null || echo "  $repo_id (可能已存在)"
done

# 3. 创建任务（Node 启动后会自动注册 agents）
echo "[3/5] 创建任务..."
curl -s -X POST "$COORD/api/v1/tasks" \
  -H "content-type: application/json" \
  -d "{\"id\":\"task-test\",\"meshId\":\"$MESH_ID\",\"subject\":\"运行测试\",\"description\":\"执行 pnpm test，确保所有测试通过，若有失败报告给 lead\",\"owner\":\"agent-tester\",\"repoId\":\"repo-test\"}" | jq . 2>/dev/null || true

curl -s -X POST "$COORD/api/v1/tasks" \
  -H "content-type: application/json" \
  -d "{\"id\":\"task-plugin\",\"meshId\":\"$MESH_ID\",\"subject\":\"插件骨架\",\"description\":\"在 apps/plugins 下实现 Slack 插件骨架：Plugin 接口、start/stop、连接 Coordinator 的占位\",\"owner\":\"agent-plugin\",\"repoId\":\"repo-plugin\"}" | jq . 2>/dev/null || true

curl -s -X POST "$COORD/api/v1/tasks" \
  -H "content-type: application/json" \
  -d "{\"id\":\"task-research\",\"meshId\":\"$MESH_ID\",\"subject\":\"需求与群组协作\",\"description\":\"研究：需求与 agent 群组如何共同推进完成。输出 docs/agent-coordination-patterns.md\",\"owner\":\"agent-research\",\"repoId\":\"repo-docs\"}" | jq . 2>/dev/null || true

echo "[4/5] 完成"
echo ""
echo "=== 下一步 ==="
echo "1. 启动 Node: pnpm node config/mesh.selfhost.yaml"
echo "2. 启动 Chat: pnpm cli chat --mesh-id $MESH_ID"
echo "3. 在 Chat 中：发消息、/tasks 查看、/task task-id 查看 agent 间讨论"
echo ""
