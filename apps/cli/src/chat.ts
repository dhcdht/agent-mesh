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

const USER_ID = "user";
const POLL_INTERVAL_MS = 3000;
const DASHBOARD_LINES = 6;

interface TaskSummary {
  id: string;
  subject: string;
  status: string;
  owner: string;
  updatedAt: string;
}

interface AgentSummary {
  id: string;
  nodeOnline?: boolean;
}

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
  const sender = m.from === USER_ID ? "\x1b[32m你\x1b[39m" : `\x1b[34m${m.from}\x1b[39m`;
  return `  \x1b[90m${ts}\x1b[39m ${sender}: ${String(text).slice(0, 300)}${taskTag ? ` \x1b[90m${taskTag}\x1b[39m` : ""}`;
}

async function fetchTasks(ctx: ChatContext): Promise<TaskSummary[]> {
  const res = await ctx.client.request<{ items: TaskSummary[] }>(
    "GET",
    `/api/v1/tasks?meshId=${encodeURIComponent(ctx.meshId)}`
  );
  return res.items ?? [];
}

async function fetchAgents(ctx: ChatContext): Promise<AgentSummary[]> {
  const res = await ctx.client.request<{ items: AgentSummary[] }>(
    "GET",
    `/api/v1/agents?meshId=${encodeURIComponent(ctx.meshId)}`
  );
  return res.items ?? [];
}

function renderDashboard(tasks: TaskSummary[], agents: AgentSummary[]): void {
  process.stdout.write("\x1b[s\x1b[1;1H");
  
  const activeTasks = tasks.filter(t => t.status === "in_progress");
  const onlineAgents = agents.filter(a => a.nodeOnline);
  
  process.stdout.write(`\x1b[1;36m[DASHBOARD] Tasks: ${activeTasks.length} active, ${tasks.length} total | Agents: ${onlineAgents.length} online\x1b[0m\x1b[K\n`);
  
  if (activeTasks.length > 0) {
    const t = activeTasks[0]!;
    process.stdout.write(`\x1b[K  Active: \x1b[33m${t.id}\x1b[39m ${t.subject.slice(0, 40)} (owner: ${t.owner})\n`);
  } else {
    process.stdout.write("\x1b[K  No active tasks\n");
  }
  
  process.stdout.write("\x1b[K" + "─".repeat(process.stdout.columns || 60) + "\n");
  
  process.stdout.write("\x1b[u");
}

import * as http from "node:http";

async function fetchChannel(ctx: ChatContext, since?: string): Promise<ChannelMessage[]> {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  const res = await ctx.client.request<{ items: ChannelMessage[] }>(
    "GET",
    `/api/v1/meshes/${encodeURIComponent(ctx.meshId)}/channel${q}`
  );
  return res.items ?? [];
}

async function listenEvents(ctx: ChatContext, onMessage: (m: ChannelMessage) => void, onRefresh: () => void): Promise<void> {
  const url = `${ctx.baseUrl}/api/v1/events?meshId=${encodeURIComponent(ctx.meshId)}`;
  
  const req = http.get(url, (res) => {
    let buffer = "";
    res.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "message_created" && event.message) {
              onMessage(event.message);
            } else if (event.type === "task_created" || event.type === "task_updated") {
              onRefresh();
            }
          } catch (e) {}
        }
      }
    });
  });
  
  req.on("error", () => {
    setTimeout(() => listenEvents(ctx, onMessage, onRefresh), 5000);
  });
}

async function sendMessage(ctx: ChatContext, to: string, text: string, taskId?: string): Promise<void> {
  await ctx.client.request("POST", "/api/v1/messages", {
    id: randomUUID(),
    meshId: ctx.meshId,
    from: USER_ID,
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
    try {
      rl.close();
    } catch {
    }
    process.exit(0);
  };

  const displayMessages = (items: ChannelMessage[]): void => {
    for (const m of items) {
      if (lastSeenIds.has(m.id)) continue;
      lastSeenIds.add(m.id);
      
      const formatted = formatMessage(m);
      if (m.from !== USER_ID) {
        simulateTyping(formatted);
      } else {
        console.log(formatted);
      }
      
      if (m.timestamp) lastSeenTimestamp = m.timestamp;
    }
  };

  async function simulateTyping(text: string) {
    const chars = text.split("");
    for (const char of chars) {
      process.stdout.write(char);
      await new Promise(r => setTimeout(r, 5));
    }
    process.stdout.write("\n");
    if (!closed) rl.prompt();
  }

  console.log(`\n  Agent Mesh 群聊 — mesh: ${ctx.meshId}`);
  console.log("  user + agents 共享实时消息流，/help 查看命令\n");

  try {
    const history = await fetchChannel(ctx);
    displayMessages(history);
    
    const refreshDashboard = async () => {
      const [t, a] = await Promise.all([fetchTasks(ctx), fetchAgents(ctx)]);
      renderDashboard(t, a);
    };

    listenEvents(ctx, (msg) => {
      displayMessages([msg]);
    }, refreshDashboard);
    
    await refreshDashboard();
  } catch {
  }

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
