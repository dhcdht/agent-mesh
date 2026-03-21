import React, { useState, useEffect, useCallback, useMemo } from "react";
import { render, Box, Text, useApp } from "ink";
import TextInput from "ink-text-input";
import { randomUUID } from "node:crypto";
import * as http from "node:http";
import type { CliClient } from "./client.js";

const USER_ID = "user";

interface ChannelMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  taskId?: string;
  timestamp?: string;
}

interface TaskSummary {
  id: string;
  subject: string;
  status: string;
  owner: string;
}

interface AgentSummary {
  id: string;
  name: string;
  nodeOnline?: boolean;
}

interface ChatContext {
  client: CliClient;
  meshId: string;
  baseUrl: string;
}

const ChatApp = ({ ctx }: { ctx: ChatContext }) => {
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { exit } = useApp();

  const refreshDashboard = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([
        ctx.client.request<{ items: TaskSummary[] }>("GET", `/api/v1/tasks?meshId=${encodeURIComponent(ctx.meshId)}`),
        ctx.client.request<{ items: AgentSummary[] }>("GET", `/api/v1/agents?meshId=${encodeURIComponent(ctx.meshId)}`),
      ]);
      setTasks(t.items || []);
      setAgents(a.items || []);
    } catch (e) {}
  }, [ctx]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await ctx.client.request<{ items: ChannelMessage[] }>(
          "GET",
          `/api/v1/meshes/${encodeURIComponent(ctx.meshId)}/channel`
        );
        setMessages(res.items || []);
      } catch (e) {}
    };

    fetchHistory();
    refreshDashboard();

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
              if (event.type === "message.created" && event.message) {
                setMessages((prev) => {
                  if (prev.some(m => m.id === event.message.id)) return prev;
                  const next = [...prev, event.message];
                  return next.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
                });
              } else if (event.type.startsWith("task.") || event.type.startsWith("agent.")) {
                refreshDashboard();
              }
            } catch (e) {}
          }
        }
      });
    });

    return () => {
      req.destroy();
    };
  }, [ctx, refreshDashboard]);

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    if (trimmed === "/quit" || trimmed === "/exit") exit();

    setIsSending(true);
    let to = "*";
    let messageText = trimmed;
    if (trimmed.startsWith("@")) {
      const space = trimmed.indexOf(" ");
      if (space > 0) {
        to = trimmed.slice(1, space).trim();
        messageText = trimmed.slice(space + 1).trim();
      }
    } else if (trimmed.startsWith("* ")) {
      messageText = trimmed.slice(2).trim();
    }

    try {
      const msgId = randomUUID();
      const newMsg: ChannelMessage = {
        id: msgId,
        from: USER_ID,
        to,
        type: "message",
        payload: { text: messageText },
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, newMsg]);

      await ctx.client.request("POST", "/api/v1/messages", {
        id: msgId,
        meshId: ctx.meshId,
        from: USER_ID,
        to,
        type: "message",
        payload: { text: messageText },
      });
      setInput("");
    } catch (e) {
      setMessages(prev => [...prev, {
        id: randomUUID(),
        from: "system",
        to: USER_ID,
        type: "error",
        payload: { error: `发送失败: ${String(e)}` }
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const activeTasks = useMemo(() => tasks.filter((t) => t.status === "in_progress"), [tasks]);
  const onlineAgents = useMemo(() => agents.filter((a) => a.nodeOnline), [agents]);

  const displayRows = process.stdout.rows || 24;
  const messageRows = Math.max(5, displayRows - 15);
  const visibleMessages = messages.slice(Math.max(0, messages.length - messageRows));

  return (
    <Box flexDirection="column" height={Math.max(10, displayRows - 1)}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column" flexShrink={0}>
        <Box>
          <Text bold color="cyan">🤖 AGENT MESH | </Text>
          <Text color="white">Mesh: {ctx.meshId} | </Text>
          <Text color="green">{onlineAgents.length} Agents Online</Text>
        </Box>
        <Box>
          <Text color="gray">Tasks: {activeTasks.length} active, {tasks.length} total</Text>
        </Box>
        {activeTasks.length > 0 && (
          <Box marginTop={0}>
            <Text color="yellow">  ➜ Active: </Text>
            <Text bold>{activeTasks[0]?.id}</Text>
            <Text color="gray"> ({activeTasks[0]?.owner}): {activeTasks[0]?.subject.slice(0, 50)}</Text>
          </Box>
        )}
      </Box>

      <Box flexGrow={1} flexDirection="column" paddingX={1} marginTop={1} minHeight={10}>
        {visibleMessages.map((m, i) => {
          const payload = m.payload as any;
          const text = payload?.text ?? payload?.summary ?? payload?.error ?? JSON.stringify(payload);
          const isUser = m.from === USER_ID;
          const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : "";
          
          return (
            <Box key={m.id || i} flexDirection="column" marginBottom={1}>
              <Box>
                <Text color="gray">{ts} </Text>
                <Text color={isUser ? "green" : "blue"} bold>{isUser ? "你" : m.from}: </Text>
              </Box>
              <Box paddingLeft={2}>
                <Text color={payload?.error ? "red" : "white"}>{String(text)}</Text>
              </Box>
              {m.taskId && <Text color="gray">  └─ task: {m.taskId}</Text>}
            </Box>
          );
        })}
      </Box>

      <Box borderStyle="single" borderColor={isSending ? "yellow" : "gray"} paddingX={1}>
        <Text bold color="green">{isSending ? "⧖ " : "> "} </Text>
        <TextInput 
          value={input} 
          onChange={setInput} 
          onSubmit={handleSubmit} 
          showCursor={!isSending}
        />
      </Box>
    </Box>
  );
};

export async function runChat(ctx: ChatContext): Promise<void> {
  try {
    await ctx.client.request("GET", `/api/v1/meshes/${encodeURIComponent(ctx.meshId)}`);
  } catch {
    console.error(`Mesh "${ctx.meshId}" 不存在`);
    process.exit(1);
  }

  const { waitUntilExit } = render(<ChatApp ctx={ctx} />);
  await waitUntilExit();
}
