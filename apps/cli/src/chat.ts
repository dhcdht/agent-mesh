/**
 * Chat 交互模式：用户与 agents 交流，查看 agent 间沟通与任务进展
 *
 * 用法：
 *   @agent-id 消息  → 发给指定 agent
 *   * 消息         → 广播给所有 agents
 *   消息           → 默认广播
 *   /task <id>     → 查看任务相关会话（含 agent 间讨论）
 *   /tasks        → 列出任务
 *   /agents       → 列出 agents
 *   /help, ?      → 帮助
 *   /quit, /exit  → 退出
 */

import * as readline from "node:readline";
import { randomUUID } from "node:crypto";
import type { CliClient } from "./client.js";

const LEAD_ID = "lead";
const POLL_INTERVAL_MS = 4000;

interface ChatContext {
  client: CliClient;
  meshId: string;
  baseUrl: string;
}

function formatMessage(m: {
  id: string;
  from: string;
  type: string;
  payload: unknown;
  taskId?: string;
  timestamp?: string;
}): string {
  const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
  const payload = m.payload as Record<string, unknown>;
  const text = payload?.text ?? payload?.summary ?? payload?.error ?? JSON.stringify(payload);
  const taskTag = m.taskId ? ` [task:${m.taskId}]` : "";
  return `  ${ts} [${m.from}] (${m.type})${taskTag}: ${String(text).slice(0, 200)}`;
}

async function pollInbox(ctx: ChatContext, lastSeenIds: Set<string>): Promise<string[]> {
  const res = await ctx.client.request<{ items: Array<{ id: string; from: string; type: string; payload: unknown; taskId?: string; timestamp?: string }> }>(
    "GET",
    `/api/v1/messages/${LEAD_ID}/inbox?meshId=${encodeURIComponent(ctx.meshId)}&unreadOnly=true`
  );
  const lines: string[] = [];
  for (const m of res.items ?? []) {
    if (lastSeenIds.has(m.id)) continue;
    lastSeenIds.add(m.id);
    lines.push(formatMessage(m));
    // 标记已读
    try {
      await ctx.client.request("POST", `/api/v1/messages/${encodeURIComponent(m.id)}/read`);
    } catch {
      // ignore
    }
  }
  return lines;
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

  console.log(`\n  Agent Mesh Chat — mesh: ${ctx.meshId}`);
  console.log("  输入消息与 agents 交流，/help 查看命令\n");

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const poll = async (): Promise<void> => {
    if (closed) return;
    try {
      const lines = await pollInbox(ctx, lastSeenIds);
      if (closed) return;
      if (lines.length > 0) {
        for (const line of lines) {
          console.log(line);
        }
        if (!closed) rl.prompt();
      }
    } catch (e) {
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
        console.log(`  → 已发送给 ${to}`);
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
