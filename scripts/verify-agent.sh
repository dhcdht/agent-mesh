#!/bin/bash
echo "[VERIFY] Running..."
# 直接使用 Node 执行绝对路径的工具，绕过一切 PATH 干扰
node /Users/dhcdht/Desktop/Projects/agent-mesh/bin/mesh-edit.js write path=/Users/dhcdht/Desktop/Projects/agent-mesh/packages/coordinator/src/routes/victory.ts content="export const VICTORY = true;"
echo "SUCCESS: PRODUCED VICTORY AT /Users/dhcdht/Desktop/Projects/agent-mesh/packages/coordinator/src/routes/victory.ts"
