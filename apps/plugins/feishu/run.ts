#!/usr/bin/env node
/**
 * 运行飞书插件：订阅 Coordinator SSE，接收任务/消息事件
 *
 * 环境变量：
 *   MESH_ID          mesh ID（必填）
 *   COORDINATOR_URL  Coordinator 地址，默认 http://localhost:3000
 *   MESH_API_KEY     可选 API Key
 *
 * 飞书推送（可选）：
 *   FEISHU_APP_ID         飞书应用 App ID
 *   FEISHU_APP_SECRET     飞书应用 App Secret
 *   FEISHU_CHAT_ID        群聊 ID（chat_id）
 *
 * 用户回复（可选）：
 *   FEISHU_VERIFICATION_TOKEN  事件订阅 Verification Token
 *   FEISHU_EVENTS_PORT         接收事件的 HTTP 端口
 */

import { FeishuPlugin } from "./index.js";

const meshId = process.env.MESH_ID;
const coordinatorUrl = process.env.MESH_COORDINATOR_URL ?? process.env.COORDINATOR_URL ?? "http://localhost:3000";
const apiKey = process.env.MESH_API_KEY;
const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const chatId = process.env.FEISHU_CHAT_ID;
const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;
const eventsPort = process.env.FEISHU_EVENTS_PORT ? parseInt(process.env.FEISHU_EVENTS_PORT, 10) : undefined;

if (!meshId) {
  console.error("MESH_ID is required");
  process.exit(1);
}

const plugin = new FeishuPlugin();
plugin
  .start({
    coordinatorUrl,
    meshId,
    apiKey,
    appId,
    appSecret,
    chatId,
    verificationToken,
    eventsPort: Number.isFinite(eventsPort) ? eventsPort : undefined,
  })
  .then(() => {
    console.log("[feishu] listening for events...");
  })
  .catch((e) => {
    console.error("[feishu] start failed:", e);
    process.exit(1);
  });

process.on("SIGINT", () => {
  plugin.stop().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  plugin.stop().then(() => process.exit(0));
});
