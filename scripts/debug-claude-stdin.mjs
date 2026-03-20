#!/usr/bin/env node
/**
 * 实验：用 stdin 适配器跑 Claude Code CLI（本地，有读写代码能力）
 * 用法：node scripts/debug-claude-stdin.mjs
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const t0 = Date.now();
const log = (msg) => console.error(`[${((Date.now() - t0) / 1000).toFixed(2)}s] ${msg}`);

log("loading StdinAdapter...");
const { StdinAdapter } = await import("../packages/node/dist/adapters/stdin.js");

const adapter = new StdinAdapter("debug-claude", {
  command: "claude",
  args: ["-p"],
  timeoutMs: 180000,
  cwd: process.cwd(),
});

const task = {
  id: "stdin-test",
  meshId: "test",
  subject: "回一个字",
  description: "只回一个字：好",
  status: "pending",
  owner: "debug-claude",
  repoId: "test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

log("execute start (claude -p, 本地)");
try {
  const result = await adapter.execute(task);
  log(`execute done`);
  console.log("summary:", result.summary?.slice(0, 500));
} catch (e) {
  log(`execute failed: ${e.message}`);
  process.exit(1);
}
