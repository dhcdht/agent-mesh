import type { Task } from "@agent-mesh/shared";

export interface AdapterExecutionResult {
  summary: string;
  output?: unknown;
}

/** 投递消息上下文（借鉴 Stream0 + adapter 协议） */
export interface MessageContext {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  taskId?: string;
}

export interface DeliverResult {
  status: "delivered" | "failed";
  error?: string;
}

export interface AgentAdapter {
  execute(task: Task): Promise<AdapterExecutionResult>;
  /** 将 inbox 消息投递给 CLI（可选，未实现则 Runner 仅打印） */
  deliverMessage?(ctx: MessageContext): Promise<DeliverResult>;
}
