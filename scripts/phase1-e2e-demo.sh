#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DB_PATH="/tmp/agent-mesh-demo-$$.db"
PORT="$((20000 + RANDOM % 10000))"
mkdir -p "$ROOT_DIR/.tmp"
mkdir -p /tmp/agent-mesh-demo
rm -f "$DB_PATH" 2>/dev/null || true
NODE_PID=""

echo "[demo] building packages"
pnpm --filter @agent-mesh/coordinator build >/dev/null
pnpm --filter @agent-mesh/node build >/dev/null

echo "[demo] starting coordinator"
COORDINATOR_DB_PATH="$DB_PATH" PORT="$PORT" pnpm --filter @agent-mesh/coordinator start > "$ROOT_DIR/.tmp/coordinator.log" 2>&1 &
COORD_PID=$!

cleanup() {
  if [[ -n "$NODE_PID" ]] && kill -0 "$NODE_PID" >/dev/null 2>&1; then
    kill "$NODE_PID" >/dev/null 2>&1 || true
  fi
  if kill -0 "$COORD_PID" >/dev/null 2>&1; then
    kill "$COORD_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for i in {1..40}; do
  if curl -sS "http://localhost:$PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -sS "http://localhost:$PORT/health" >/dev/null 2>&1; then
  echo "[demo] coordinator failed to become healthy"
  echo "[demo] see log: $ROOT_DIR/.tmp/coordinator.log"
  exit 1
fi

echo "[demo] create mesh and task for agent-frontend"
curl -sS -X POST "http://localhost:$PORT/api/v1/meshes" \
  -H 'content-type: application/json' \
  -d '{"id":"mesh-example","name":"demo mesh"}' >/dev/null || true

curl -sS -X POST "http://localhost:$PORT/api/v1/tasks" \
  -H 'content-type: application/json' \
  -d '{"id":"demo-task-1","meshId":"mesh-example","subject":"demo","description":"demo task","owner":"agent-frontend","repoId":"frontend-repo"}' >/dev/null

echo "[demo] start agent node (8s)"
MESH_COORDINATOR_URL="http://localhost:$PORT" pnpm --filter @agent-mesh/node start "$ROOT_DIR/config/mesh.demo.yaml" > "$ROOT_DIR/.tmp/node.log" 2>&1 &
NODE_PID=$!
sleep 8
if kill -0 "$NODE_PID" >/dev/null 2>&1; then
  kill "$NODE_PID" >/dev/null 2>&1 || true
fi

echo "[demo] fetch lead inbox"
INBOX=$(curl -sS "http://localhost:$PORT/api/v1/messages/lead/inbox?meshId=mesh-example&unreadOnly=false")
echo "$INBOX" | head -c 500
echo ""

# 校验：lead 收件箱应包含 done 消息
if echo "$INBOX" | grep -q '"type":"done"'; then
  echo "[demo] OK: lead received done message"
else
  echo "[demo] WARN: lead inbox empty or no done message (check .tmp/node.log)"
fi

echo "[demo] done"
