#!/usr/bin/env node
/**
 * 最小复现 ACP 延迟：直接调用 AcpAdapter.execute，打各阶段耗时
 * 用法：ACP_DEBUG=1 node scripts/debug-acp-latency.mjs
 * 需：pnpm build 且 opencode 已安装
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const t0 = Date.now();
const log = (msg) => console.error(`[${((Date.now() - t0) / 1000).toFixed(2)}s] ${msg}`);

log("loading AcpAdapter...");
const { AcpAdapter } = await import("../packages/node/dist/adapters/acp.js");

const adapter = new AcpAdapter("debug-agent", {
  timeoutMs: Number(process.env.ACP_TIMEOUT_MS) || 300000,
  cwd: process.cwd(),
});

const task = {
  id: "latency-test",
  meshId: "test",
  subject: "回一个字",
  description: "只回一个字：好",
  status: "pending",
  owner: "debug-agent",
  repoId: "test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

log("execute start (prompt: 只回一个字：好)");
try {
  const result = await adapter.execute(task);
  log(`execute done, summary length: ${(result.summary || "").length}`);
  console.log("summary:", result.summary?.slice(0, 200));
} catch (e) {
  log(`execute failed: ${e.message}`);
  process.exit(1);
}
