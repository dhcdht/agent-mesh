#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DB_PATH="$ROOT_DIR/.tmp/phase1-demo.db"
PORT="$((20000 + RANDOM % 10000))"
OPENCODE_PORT="$((30000 + RANDOM % 10000))"
DEMO_CONFIG="$ROOT_DIR/.tmp/mesh.demo.yaml"
mkdir -p "$ROOT_DIR/.tmp"
rm -f "$DB_PATH"
NODE_PID=""
OPENCODE_PID=""

echo "[demo] building packages"
pnpm --filter @agent-mesh/coordinator build >/dev/null
pnpm --filter @agent-mesh/node build >/dev/null

sed 's|url: http://localhost:3000|url: http://localhost:'"$PORT"'|' "$ROOT_DIR/config/mesh.example.yaml" \
  | sed 's|serverUrl: http://localhost:4096|serverUrl: http://localhost:'"$OPENCODE_PORT"'|' \
  > "$DEMO_CONFIG"

echo "[demo] starting mock opencode service"
node -e 'const http=require("http");const p=process.env.OPENCODE_PORT||"4097";http.createServer((req,res)=>{if(req.method==="POST"&&req.url==="/run"){let b="";req.on("data",d=>b+=d);req.on("end",()=>{let data={};try{data=JSON.parse(b)}catch{};res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({summary:`mock-opencode completed ${data?.task?.id??"task"}`,output:{echo:data}}));});return;}res.writeHead(404);res.end("not found");}).listen(Number(p),"127.0.0.1");setInterval(()=>{},1000);' > "$ROOT_DIR/.tmp/opencode.log" 2>&1 &
OPENCODE_PID=$!

for i in {1..20}; do
  if curl -sS -X POST "http://127.0.0.1:$OPENCODE_PORT/run" \
    -H 'content-type: application/json' \
    -d '{"task":{"id":"ping"}}' >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "[demo] starting coordinator"
COORDINATOR_DB_PATH="$DB_PATH" PORT="$PORT" pnpm --filter @agent-mesh/coordinator start > "$ROOT_DIR/.tmp/coordinator.log" 2>&1 &
COORD_PID=$!

cleanup() {
  if [[ -n "$NODE_PID" ]] && kill -0 "$NODE_PID" >/dev/null 2>&1; then
    kill "$NODE_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$OPENCODE_PID" ]] && kill -0 "$OPENCODE_PID" >/dev/null 2>&1; then
    kill "$OPENCODE_PID" >/dev/null 2>&1 || true
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

echo "[demo] create task for agent-frontend"
curl -sS -X POST "http://localhost:$PORT/api/v1/meshes" \
  -H 'content-type: application/json' \
  -d '{"id":"mesh-example","name":"demo mesh"}' >/dev/null || true

curl -sS -X POST "http://localhost:$PORT/api/v1/tasks" \
  -H 'content-type: application/json' \
  -d '{"id":"demo-task-1","meshId":"mesh-example","subject":"demo","description":"demo task","owner":"agent-frontend","repoId":"repo-frontend"}' >/dev/null

echo "[demo] start agent node (10s)"
pnpm --filter @agent-mesh/node start ../../.tmp/mesh.demo.yaml > "$ROOT_DIR/.tmp/node.log" 2>&1 &
NODE_PID=$!
sleep 10
if kill -0 "$NODE_PID" >/dev/null 2>&1; then
  kill "$NODE_PID" >/dev/null 2>&1 || true
fi

echo "[demo] fetch lead inbox"
curl -sS "http://localhost:$PORT/api/v1/messages/lead/inbox?meshId=mesh-example&unreadOnly=false" | cat

echo "[demo] done"
