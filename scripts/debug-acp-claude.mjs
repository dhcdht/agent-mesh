#!/usr/bin/env node
/**
 * 测试 Claude Agent ACP 的 initialize 延迟（对比 opencode 的 ~98s）
 * 用法：ACP_DEBUG=1 node scripts/debug-acp-claude.mjs
 * 需：pnpm build 且 npm i -g @zed-industries/claude-agent-acp
 * 环境变量：ANTHROPIC_API_KEY 必须已设置
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const t0 = Date.now();
const log = (msg) => console.error(`[${((Date.now() - t0) / 1000).toFixed(2)}s] ${msg}`);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY required for claude-agent-acp");
  process.exit(1);
}

log("loading AcpAdapter...");
const { AcpAdapter } = await import("../packages/node/dist/adapters/acp.js");

const adapter = new AcpAdapter("debug-claude", {
  command: "claude-agent-acp",
  args: [],
  timeoutMs: Number(process.env.ACP_TIMEOUT_MS) || 300000,
  cwd: process.cwd(),
});

const task = {
  id: "latency-test",
  meshId: "test",
  subject: "回一个字",
  description: "只回一个字：好",
  status: "pending",
  owner: "debug-claude",
  repoId: "test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

log("execute start (Claude Agent ACP, prompt: 只回一个字：好)");
try {
  const result = await adapter.execute(task);
  log(`execute done, summary length: ${(result.summary || "").length}`);
  console.log("summary:", result.summary?.slice(0, 200));
} catch (e) {
  log(`execute failed: ${e.message}`);
  process.exit(1);
}
