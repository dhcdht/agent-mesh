import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Task } from "@agent-mesh/shared";
import type { AdapterExecutionResult, AgentAdapter, DeliverResult, MessageContext } from "./types.js";

interface ClaudeCodeAdapterConfig {
  teamName: string;
  baseDir?: string;
}

function toConfig(cliConfig: Record<string, unknown>): ClaudeCodeAdapterConfig {
  const teamName = String(cliConfig.teamName ?? cliConfig.meshId ?? "default");
  const baseDir = cliConfig.baseDir
    ? String(cliConfig.baseDir)
    : join(homedir(), ".claude");
  return { teamName, baseDir };
}

function getInboxPath(baseDir: string, teamName: string, agentId: string): string {
  return join(baseDir, "teams", teamName, "inboxes", `${agentId}.json`);
}

function ensureInboxDir(inboxPath: string): void {
  const dir = join(inboxPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  private readonly config: ClaudeCodeAdapterConfig;

  constructor(private readonly agentId: string, cliConfig: Record<string, unknown>) {
    this.config = toConfig(cliConfig);
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    const inboxPath = getInboxPath(this.config.baseDir!, this.config.teamName, this.agentId);
    ensureInboxDir(inboxPath);

    const taskAssignment = {
      type: "task_assignment",
      taskId: task.id,
      subject: task.subject,
      description: task.description,
      assignedBy: "agent-mesh-node",
      timestamp: new Date().toISOString(),
    };

    const envelope = {
      from: "agent-mesh-node",
      text: JSON.stringify(taskAssignment),
      timestamp: new Date().toISOString(),
      read: false,
    };

    let entries: unknown[] = [];
    if (existsSync(inboxPath)) {
      try {
        const raw = readFileSync(inboxPath, "utf-8");
        entries = JSON.parse(raw) as unknown[];
      } catch {
        entries = [];
      }
    }

    entries.push(envelope);
    writeFileSync(inboxPath, JSON.stringify(entries, null, 2), "utf-8");

    return {
      summary: `Task ${task.id} written to Claude Code inbox at ${inboxPath}. Run Claude Code to process.`,
      output: { inboxPath, taskId: task.id },
    };
  }

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    const inboxPath = getInboxPath(this.config.baseDir!, this.config.teamName, this.agentId);
    ensureInboxDir(inboxPath);

    const envelope = {
      from: ctx.from,
      text: JSON.stringify({
        type: ctx.type,
        payload: ctx.payload,
        taskId: ctx.taskId,
        messageId: ctx.id,
      }),
      timestamp: new Date().toISOString(),
      read: false,
    };

    let entries: unknown[] = [];
    if (existsSync(inboxPath)) {
      try {
        const raw = readFileSync(inboxPath, "utf-8");
        entries = JSON.parse(raw) as unknown[];
      } catch {
        entries = [];
      }
    }
    entries.push(envelope);
    writeFileSync(inboxPath, JSON.stringify(entries, null, 2), "utf-8");
    return { status: "delivered" };
  }
}
