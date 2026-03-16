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
  blocks: string[];
  blockedBy: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  meshId: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  timestamp: string;
  read: boolean;
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
