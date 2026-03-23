#!/bin/bash
set -e

echo "Starting coordinator..."
pnpm coordinator > coordinator.log 2>&1 &
COORD_PID=$!
sleep 2

echo "Creating task for pi-agent..."
pnpm cli task:create \
  --id "task-pi-test" \
  --mesh-id "pi-test-mesh" \
  --subject "Modify test file" \
  --description "Read the file at /tmp/pi-agent-test/test.txt and append ' - modified by pi-agent' to it. You can use the 'mesh-edit' or built-in tools." \
  --owner "agent-pi" \
  --repo-id "test-repo"

echo "Starting node..."
pnpm --filter @agent-mesh/node start ../../config/mesh.pi-test.yaml > node.log 2>&1 &
NODE_PID=$!

echo "Waiting for task completion..."
for i in {1..30}; do
  STATUS=$(pnpm cli task:list --mesh-id pi-test-mesh | grep task-pi-test || true)
  if echo "$STATUS" | grep -q "completed"; then
    echo "Task completed successfully!"
    break
  fi
  sleep 2
done

echo "Node log:"
cat node.log

echo "Test file content:"
cat /tmp/pi-agent-test/test.txt

kill $NODE_PID
kill $COORD_PID
wait $NODE_PID 2>/dev/null || true
wait $COORD_PID 2>/dev/null || true
