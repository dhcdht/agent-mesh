/**
 * 群聊模式：lead + agents 共享同一消息流，类似普通 agent CLI 的 chat 体验
 *
 * 用法：
 *   @agent-id 消息  → 发给指定 agent
 *   * 消息         → 广播给所有 agents
 *   消息           → 默认广播（群组可见）
 *   /task <id>     → 查看任务相关会话
 *   /tasks        → 列出任务
 *   /agents       → 列出 agents
 *   /help, ?      → 帮助
 *   /quit, /exit  → 退出
 */

import * as readline from "node:readline";
import { randomUUID } from "node:crypto";
import type { CliClient } from "./client.js";

const LEAD_ID = "lead";
const POLL_INTERVAL_MS = 3000;

interface ChatContext {
  client: CliClient;
  meshId: string;
  baseUrl: string;
}

interface ChannelMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  taskId?: string;
  timestamp?: string;
}

function formatMessage(m: ChannelMessage): string {
  const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
  const payload = m.payload as Record<string, unknown>;
  const text = payload?.text ?? payload?.summary ?? payload?.error ?? JSON.stringify(payload);
  const taskTag = m.taskId ? ` [task:${m.taskId}]` : "";
  const sender = m.from === LEAD_ID ? "你" : m.from;
  return `  ${ts} ${sender}: ${String(text).slice(0, 300)}${taskTag ? ` ${taskTag}` : ""}`;
}

async function fetchChannel(ctx: ChatContext, since?: string): Promise<ChannelMessage[]> {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  const res = await ctx.client.request<{ items: ChannelMessage[] }>(
    "GET",
    `/api/v1/meshes/${encodeURIComponent(ctx.meshId)}/channel${q}`
  );
  return res.items ?? [];
}

async function sendMessage(ctx: ChatContext, to: string, text: string, taskId?: string): Promise<void> {
  await ctx.client.request("POST", "/api/v1/messages", {
    id: randomUUID(),
    meshId: ctx.meshId,
    from: LEAD_ID,
    to,
    type: "message",
    payload: { text },
    ...(taskId ? { taskId } : {}),
  });
}

async function showTaskMessages(ctx: ChatContext, taskId: string): Promise<void> {
  const res = await ctx.client.request<{ items: Array<{ from: string; to: string; type: string; payload: unknown; taskId?: string; timestamp?: string }> }>(
    "GET",
    `/api/v1/tasks/${encodeURIComponent(taskId)}/messages?meshId=${encodeURIComponent(ctx.meshId)}`
  );
  const items = res.items ?? [];
  if (items.length === 0) {
    console.log(`  任务 ${taskId} 暂无消息`);
    return;
  }
  for (const m of items) {
    const payload = m.payload as Record<string, unknown>;
    const text = payload?.text ?? payload?.summary ?? JSON.stringify(payload);
    const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
    console.log(`  ${ts} ${m.from} → ${m.to} (${m.type}): ${String(text).slice(0, 150)}`);
  }
}

async function showTasks(ctx: ChatContext): Promise<void> {
  const res = await ctx.client.request<{ items: Array<{ id: string; subject: string; status: string; owner: string }> }>(
    "GET",
    `/api/v1/tasks?meshId=${encodeURIComponent(ctx.meshId)}`
  );
  const items = res.items ?? [];
  if (items.length === 0) {
    console.log("  暂无任务");
    return;
  }
  for (const t of items) {
    console.log(`  ${t.id} [${t.status}] ${t.subject} (owner: ${t.owner})`);
  }
}

async function showAgents(ctx: ChatContext): Promise<void> {
  const res = await ctx.client.request<{ items: Array<{ id: string; name: string; status: string }> }>(
    "GET",
    `/api/v1/agents?meshId=${encodeURIComponent(ctx.meshId)}`
  );
  const items = res.items ?? [];
  if (items.length === 0) {
    console.log("  暂无 agents");
    return;
  }
  for (const a of items) {
    console.log(`  @${a.id} (${a.name}) [${a.status}]`);
  }
}

function printHelp(): void {
  console.log(`
  命令:
    @<agent-id> <消息>  发给指定 agent
    * <消息>            广播给所有 agents
    <消息>              默认广播

    /task <task-id>     查看任务相关会话（含 agent 间讨论）
    /tasks             列出任务
    /agents            列出 agents
    /help, ?           帮助
    /quit, /exit       退出
`);
}

export async function runChat(ctx: ChatContext): Promise<void> {
  try {
    await ctx.client.request("GET", `/api/v1/meshes/${encodeURIComponent(ctx.meshId)}`);
  } catch {
    console.error(`Mesh "${ctx.meshId}" 不存在，请先创建或检查 mesh-id`);
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let lastSeenTimestamp: string | undefined;
  const lastSeenIds = new Set<string>();
  let closed = false;

  const doClose = (): void => {
    if (closed) return;
    closed = true;
    if (pollTimer) clearInterval(pollTimer);
    try {
      rl.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  const displayMessages = (items: ChannelMessage[]): void => {
    for (const m of items) {
      if (lastSeenIds.has(m.id)) continue;
      lastSeenIds.add(m.id);
      console.log(formatMessage(m));
      if (m.timestamp) lastSeenTimestamp = m.timestamp;
    }
  };

  console.log(`\n  Agent Mesh 群聊 — mesh: ${ctx.meshId}`);
  console.log("  lead + agents 共享消息流，/help 查看命令\n");

  // 初始加载历史
  try {
    const history = await fetchChannel(ctx);
    if (history.length > 0) {
      displayMessages(history);
      console.log("");
    }
  } catch {
    // 忽略
  }

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const poll = async (): Promise<void> => {
    if (closed) return;
    try {
      const items = await fetchChannel(ctx, lastSeenTimestamp);
      if (closed) return;
      if (items.length > 0) {
        displayMessages(items);
        if (!closed) rl.prompt();
      }
    } catch {
      // 静默忽略轮询错误
    }
  };

  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  poll();

  const prompt = (): void => {
    if (closed) return;
    try {
      rl.question("> ", async (input) => {
      if (closed) return;
      const line = input.trim();
      if (!line) {
        if (!closed) setImmediate(prompt);
        return;
      }

      if (line === "/help" || line === "?") {
        printHelp();
        if (!closed) setImmediate(prompt);
        return;
      }
      if (line === "/quit" || line === "/exit") {
        doClose();
        return;
      }
      if (line.startsWith("/task ")) {
        const taskId = line.slice(6).trim();
        if (taskId) {
        try {
          await showTaskMessages(ctx, taskId);
          } catch (e) {
            console.error("  ", e instanceof Error ? e.message : e);
          }
        }
        if (!closed) setImmediate(prompt);
        return;
      }
      if (line === "/tasks") {
        try {
          await showTasks(ctx);
        } catch (e) {
          console.error("  ", e instanceof Error ? e.message : e);
        }
        if (!closed) setImmediate(prompt);
        return;
      }
      if (line === "/agents") {
        try {
          await showAgents(ctx);
        } catch (e) {
          console.error("  ", e instanceof Error ? e.message : e);
        }
        if (!closed) setImmediate(prompt);
        return;
      }

      // 发送消息
      let to = "*";
      let text = line;
      if (line.startsWith("@")) {
        const space = line.indexOf(" ");
        if (space > 0) {
          to = line.slice(1, space).trim();
          text = line.slice(space + 1).trim();
        } else {
          to = line.slice(1).trim();
          text = "";
        }
      } else if (line.startsWith("* ")) {
        text = line.slice(2).trim();
      }

      if (!text) {
        console.log("  消息不能为空");
        if (!closed) setImmediate(prompt);
        return;
      }

      try {
        await sendMessage(ctx, to, text);
        console.log(`  → 已发送${to === "*" ? "到群组" : `给 @${to}`}`);
      } catch (e) {
        console.error("  发送失败:", e instanceof Error ? e.message : e);
      }
      if (!closed) setImmediate(prompt);
    });
    } catch (e) {
      if (!closed) process.exit(1);
    }
  };

  prompt();
}
