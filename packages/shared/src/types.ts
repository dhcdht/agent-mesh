export type MeshStatus = "created" | "running" | "completed" | "recycled";
export type TaskStatus = "pending" | "in_progress" | "completed" | "deleted";
export type AgentStatus = "idle" | "busy" | "offline";

export interface Mesh {
  id: string;
  name: string;
  status: MeshStatus;
  createdAt: string;
  completedAt?: string;
}

export interface Task {
  id: string;
  meshId: string;
  subject: string;
  description: string;
  status: TaskStatus;
  owner: string;
  repoId: string;
  createdAt: string;
  updatedAt: string;
}

/** 标准消息类型（借鉴 Stream0：request/question/answer/done/failed + broadcast） */
export type MessageType =
  | "request"   // 任务请求
  | "question"  // 任务中澄清问题
  | "answer"    // 对 question 的回复
  | "done"      // 任务完成通知
  | "failed"    // 任务失败通知
  | "broadcast" // 群组广播
  | "message";  // 通用自由格式

/** 广播收件人：to 为此值时投递给 mesh 内所有 agent（不含 lead） */
export const BROADCAST_RECIPIENT = "*";

export interface Message {
  id: string;
  meshId: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  timestamp: string;
  read: boolean;
  /** 关联任务 ID，用于按 task 聚合会话（借鉴 Stream0 task-based conversation） */
  taskId?: string;
}

export interface Agent {
  id: string;
  meshId: string;
  name: string;
  repoId: string;
  cliType: string;
  cliConfig: Record<string, unknown>;
  nodeId?: string;
  status: AgentStatus;
}

export interface Repo {
  id: string;
  meshId: string;
  path: string;
  gitRemote?: string;
  agentId: string;
}
