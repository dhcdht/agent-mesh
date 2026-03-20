import { appendFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter, DeliverResult, MessageContext } from "./types.js";

interface AcpPoolConfig {
  model?: string;
  timeoutMs: number;
  messagesFilePath?: string;
  cwd?: string;
  command?: string;
  args?: string[];
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

function stripEscapeSequences(raw: string): string {
  return raw
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function toConfig(agentId: string, cliConfig: Record<string, unknown>): AcpPoolConfig {
  const model = cliConfig.model ? String(cliConfig.model) : undefined;
  const timeoutMs = Number(cliConfig.timeoutMs ?? 120000);
  const messagesFilePath = cliConfig.messagesFilePath
    ? String(cliConfig.messagesFilePath)
    : join(tmpdir(), `agent-mesh-${agentId}-messages.jsonl`);
  const cwd = cliConfig.cwd ? String(cliConfig.cwd) : process.cwd();
  const command = cliConfig.command ? String(cliConfig.command) : "opencode";
  const args = Array.isArray(cliConfig.args) ? cliConfig.args.map(String) : command === "opencode" ? ["acp"] : [];
  return {
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120000,
    messagesFilePath,
    cwd,
    command,
    args,
  };
}

class AcpProcess {
  private proc: ChildProcess | null = null;
  private sessionId: string | null = null;
  private messageId = 1;
  private lineBuffer = "";
  private initialized = false;
  private pendingRequests = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>();
  private agentTextChunks: string[] = [];
  private readonly debug: boolean;
  private readonly t0 = Date.now();

  constructor(
    private readonly agentId: string,
    private readonly config: AcpPoolConfig
  ) {
    this.debug = process.env.ACP_DEBUG === "1" || process.env.ACP_DEBUG === "true";
  }

  private logDebug(label: string) {
    if (this.debug) console.error(`[ACP-Pool:${this.agentId}] +${Date.now() - this.t0}ms ${label}`);
  }

  async start(): Promise<void> {
    if (this.proc) return;

    this.proc = spawn(this.config.command!, this.config.args!, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd: this.config.cwd,
    });

    this.proc.stdout?.on("data", (chunk: Buffer) => {
      this.lineBuffer += chunk.toString("utf-8");
      const lines = this.lineBuffer.split("\n");
      this.lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        this.processLine(line);
      }
    });

    this.proc.on("close", () => {
      this.logDebug("process closed");
      this.cleanup();
    });

    this.proc.on("error", (err) => {
      this.logDebug(`process error: ${err.message}`);
      this.cleanup();
    });

    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const result = await this.sendRequest("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: "agent-mesh", title: "Agent Mesh", version: "0.1.0" },
    });

    if (!result || typeof result !== "object" || !("protocolVersion" in result)) {
      throw new Error("Initialize failed: invalid response");
    }

    const sessionResult = await this.sendRequest("session/new", {
      cwd: this.config.cwd,
      mcpServers: [],
    });

    if (!sessionResult || typeof sessionResult !== "object" || !("sessionId" in sessionResult)) {
      throw new Error("Session creation failed");
    }

    this.sessionId = String(sessionResult.sessionId);
    this.initialized = true;
    this.logDebug(`initialized with session ${this.sessionId}`);
  }

  private processLine(line: string) {
    const cleaned = stripEscapeSequences(line).trim();
    if (!cleaned) return;

    try {
      const msg = JSON.parse(cleaned) as JsonRpcMessage;
      if (!msg.jsonrpc) return;

      if (this.debug) {
        const kind = msg.method ?? (msg.result ? `result(id=${msg.id})` : msg.error ? `error(id=${msg.id})` : "?");
        this.logDebug(`recv ${kind}`);
      }

      if (msg.method === "session/update" && msg.id === undefined) {
        const update = msg.params?.update as { sessionUpdate?: string; content?: { type?: string; text?: string } } | undefined;
        if (update?.sessionUpdate === "agent_message_chunk" && update?.content?.type === "text" && typeof update.content.text === "string") {
          this.agentTextChunks.push(update.content.text);
        }
        return;
      }

      if (msg.method === "session/request_permission" && msg.id !== undefined) {
        const options = (msg.params?.options as Array<{ optionId: string }>) ?? [];
        const allowId = options.find((o) => o.optionId === "allow-always" || o.optionId === "allow-once")?.optionId ?? "allow-once";
        this.send({
          jsonrpc: "2.0",
          id: msg.id,
          result: { outcome: { outcome: "selected", optionId: allowId } },
        });
        return;
      }

      if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
        const pending = this.pendingRequests.get(msg.id)!;
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`ACP error: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      }
    } catch {
      return;
    }
  }

  private send(msg: JsonRpcMessage) {
    if (!this.proc?.stdin) throw new Error("Process not started");
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.messageId++;
    this.send({ jsonrpc: "2.0", id, method, params });
    if (this.debug) this.logDebug(`send ${method}(id=${id})`);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, this.config.timeoutMs);
    });
  }

  async executePrompt(prompt: string): Promise<string> {
    if (!this.initialized || !this.sessionId) {
      throw new Error("Process not initialized");
    }

    this.agentTextChunks = [];
    await this.sendRequest("session/prompt", {
      sessionId: this.sessionId,
      prompt: [{ type: "text", text: prompt }],
    });

    return this.agentTextChunks.join("").trim() || "Task completed";
  }

  cleanup() {
    this.proc?.kill("SIGTERM");
    this.proc = null;
    this.sessionId = null;
    this.initialized = false;
    this.pendingRequests.clear();
  }
}

export class AcpPoolAdapter implements AgentAdapter {
  private readonly config: AcpPoolConfig;
  private process: AcpProcess | null = null;

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(agentId, cliConfig);
  }

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    try {
      appendFileSync(
        this.config.messagesFilePath!,
        JSON.stringify({ from: ctx.from, type: ctx.type, payload: ctx.payload, taskId: ctx.taskId }) + "\n",
        "utf-8"
      );
      return { status: "delivered" };
    } catch (e) {
      return { status: "failed", error: String(e) };
    }
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    if (!this.process) {
      this.process = new AcpProcess(this.agentId, this.config);
      await this.process.start();
    }

    let prompt = `You are agent ${this.agentId}. Complete task ${task.id}: ${task.subject}\n\n${task.description}`;
    const msgPath = this.config.messagesFilePath;
    if (msgPath && existsSync(msgPath)) {
      try {
        const raw = readFileSync(msgPath, "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        unlinkSync(msgPath);
        if (lines.length > 0) {
          const msgs = lines.map((l) => JSON.parse(l) as { from: string; type: string; payload: unknown; taskId?: string });
          prompt += `\n\n--- Messages from other agents (process these first if relevant) ---\n`;
          prompt += msgs.map((m) => `[${m.from}] ${m.type}: ${JSON.stringify(m.payload)}`).join("\n");
          prompt += "\n--- End messages ---\n";
        }
      } catch (err) {
        console.warn(`Failed to read messages file: ${err}`);
      }
    }

    try {
      const summary = await this.process.executePrompt(prompt);
      return {
        summary,
        output: { stdout: summary, stderr: "", exitCode: 0 },
      };
    } catch (error) {
      this.process.cleanup();
      this.process = null;
      throw error;
    }
  }

  async cleanup() {
    this.process?.cleanup();
    this.process = null;
  }
}
