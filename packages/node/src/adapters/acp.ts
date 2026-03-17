import { appendFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter, DeliverResult, MessageContext } from "./types.js";

interface AcpAdapterConfig {
  model?: string;
  timeoutMs: number;
  /** 消息暂存路径，用于将 inbox 消息注入下次任务 prompt */
  messagesFilePath?: string;
  /** 工作目录，opencode acp 在此目录执行 */
  cwd?: string;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

/** 过滤 OSC 等终端转义序列，避免污染 JSON-RPC 解析（opencode acp 已知问题） */
function stripEscapeSequences(raw: string): string {
  return raw
    .replace(/\x1b\][^\x07]*\x07/g, "") // OSC sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ""); // CSI sequences
}

function toConfig(agentId: string, cliConfig: Record<string, unknown>): AcpAdapterConfig {
  const model = cliConfig.model ? String(cliConfig.model) : undefined;
  const timeoutMs = Number(cliConfig.timeoutMs ?? 120000);
  const messagesFilePath = cliConfig.messagesFilePath
    ? String(cliConfig.messagesFilePath)
    : join(tmpdir(), `agent-mesh-${agentId}-messages.jsonl`);
  const cwd = cliConfig.cwd ? String(cliConfig.cwd) : process.cwd();
  return {
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 120000,
    messagesFilePath,
    cwd,
  };
}

export class AcpAdapter implements AgentAdapter {
  private readonly config: AcpAdapterConfig;

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
    return new Promise((resolve, reject) => {
      const proc = spawn("opencode", ["acp"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        cwd: this.config.cwd,
      });

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let messageId = 1;
      let sessionId: string | null = null;
      let promptResolved = false;

      proc.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
      proc.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));

      const timeout = setTimeout(() => {
        if (!promptResolved) {
          promptResolved = true;
          proc.kill("SIGTERM");
          reject(new Error(`ACP adapter timed out after ${this.config.timeoutMs}ms`));
        }
      }, this.config.timeoutMs);

      const send = (msg: JsonRpcMessage) => {
        proc.stdin?.write(JSON.stringify(msg) + "\n");
      };

      const sendRequest = (method: string, params: Record<string, unknown>, id?: number) => {
        const reqId = id ?? messageId++;
        send({ jsonrpc: "2.0", id: reqId, method, params });
        return reqId;
      };

      const finish = (reason: "success" | "error") => {
        if (promptResolved) return;
        promptResolved = true;
        clearTimeout(timeout);
        const out = Buffer.concat(stdout).toString("utf-8");
        const err = Buffer.concat(stderr).toString("utf-8");
        proc.stdin?.end();
        if (reason === "success") {
          resolve({
            summary: out.slice(-500) || `Task ${task.id} completed via ACP`,
            output: { stdout: out, stderr: err, exitCode: 0 },
          });
        } else {
          reject(new Error(`ACP error: ${err.slice(0, 500) || out.slice(0, 500)}`));
        }
      };

      let lineBuffer = "";
      const processLine = (line: string) => {
        const cleaned = stripEscapeSequences(line).trim();
        if (!cleaned) return;
        try {
          const msg = JSON.parse(cleaned) as JsonRpcMessage;
          if (!msg.jsonrpc) return;

          // 请求：session/request_permission -> 自动批准
          if (msg.method === "session/request_permission" && msg.id !== undefined) {
            const options = (msg.params?.options as Array<{ optionId: string }>) ?? [];
            const allowId = options.find((o) => o.optionId === "allow-always" || o.optionId === "allow-once")?.optionId ?? "allow-once";
            send({
              jsonrpc: "2.0",
              id: msg.id,
              result: { outcome: { outcome: "selected", optionId: allowId } },
            });
            return;
          }

          // 响应：按 id 判断
          if (msg.id === 0 && msg.result) {
            // initialize 响应
            const result = msg.result as Record<string, unknown>;
            if (result.protocolVersion === undefined) {
              finish("error");
              return;
            }
            sendRequest("session/new", {
              cwd: this.config.cwd,
              mcpServers: [],
            });
            return;
          }

          if (msg.id === 1 && msg.result) {
            // session/new 响应
            const result = msg.result as { sessionId?: string };
            sessionId = result.sessionId ?? null;
            if (!sessionId) {
              finish("error");
              return;
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
              } catch {
                // ignore
              }
            }
            sendRequest("session/prompt", {
              sessionId,
              prompt: [{ type: "text", text: prompt }],
            });
            return;
          }

          if (msg.id === 2 && (msg.result || msg.error)) {
            // session/prompt 响应
            if (msg.error) {
              finish("error");
              return;
            }
            finish("success");
          }
        } catch {
          // 非 JSON 行，忽略
        }
      };

      proc.stdout?.on("data", (chunk: Buffer) => {
        lineBuffer += chunk.toString("utf-8");
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          processLine(line);
        }
      });

      proc.on("spawn", () => {
        sendRequest("initialize", {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
            terminal: true,
          },
          clientInfo: { name: "agent-mesh", title: "Agent Mesh", version: "0.1.0" },
        }, 0);
      });

      proc.on("close", (code, signal) => {
        if (!promptResolved) {
          promptResolved = true;
          clearTimeout(timeout);
          const out = Buffer.concat(stdout).toString("utf-8");
          const err = Buffer.concat(stderr).toString("utf-8");
          if (code === 0 || out.length > 0) {
            resolve({
              summary: out.slice(-500) || `Task ${task.id} completed via ACP`,
              output: { stdout: out, stderr: err, exitCode: code ?? 0 },
            });
          } else {
            reject(new Error(`ACP exited with code ${code}${signal ? ` signal ${signal}` : ""}: ${err.slice(0, 500)}`));
          }
        }
      });

      proc.on("error", (err) => {
        if (!promptResolved) {
          promptResolved = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }
}
