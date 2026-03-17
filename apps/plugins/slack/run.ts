#!/usr/bin/env node
/**
 * 运行 Slack 插件：订阅 Coordinator SSE，接收任务/消息事件
 *
 * 环境变量：
 *   MESH_ID          mesh ID（必填）
 *   COORDINATOR_URL  Coordinator 地址，默认 http://localhost:3000
 *   MESH_API_KEY     可选 API Key
 */

import { SlackPlugin } from "./index.js";

const meshId = process.env.MESH_ID;
const coordinatorUrl = process.env.MESH_COORDINATOR_URL ?? process.env.COORDINATOR_URL ?? "http://localhost:3000";
const apiKey = process.env.MESH_API_KEY;

if (!meshId) {
  console.error("MESH_ID is required");
  process.exit(1);
}

const plugin = new SlackPlugin();
plugin
  .start({
    coordinatorUrl,
    meshId,
    apiKey,
  })
  .then(() => {
    console.log("[slack] listening for events...");
  })
  .catch((e) => {
    console.error("[slack] start failed:", e);
    process.exit(1);
  });

process.on("SIGINT", () => {
  plugin.stop().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  plugin.stop().then(() => process.exit(0));
});
