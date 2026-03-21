import type { Agent, Mesh, Message, Repo, Task } from "@agent-mesh/shared";

export interface CreateMeshInput {
  id: string;
  name: string;
}

export interface UpdateMeshInput {
  name?: string;
  status?: Mesh["status"];
  completedAt?: string;
}

export interface CreateRepoInput {
  id: string;
  meshId: string;
  path: string;
  gitRemote?: string;
  agentId: string;
}

export interface RegisterAgentInput {
  id: string;
  meshId: string;
  name: string;
  repoId: string;
  cliType: string;
  cliConfig: Record<string, unknown>;
  nodeId?: string;
  status?: Agent["status"];
}

export interface CreateTaskInput {
  id: string;
  meshId: string;
  subject: string;
  description: string;
  owner: string;
  repoId: string;
}

export interface UpdateTaskInput {
  subject?: string;
  description?: string;
  status?: Task["status"];
  owner?: string;
  repoId?: string;
}

export interface CreateMessageInput {
  id: string;
  meshId: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  taskId?: string;
}

export interface CoordinatorStorage {
  createMesh(input: CreateMeshInput): Mesh;
  getMesh(id: string): Mesh | undefined;
  listMeshes(): Mesh[];
  updateMesh(id: string, patch: UpdateMeshInput): Mesh | undefined;

  createRepo(input: CreateRepoInput): Repo;
  listRepos(meshId: string): Repo[];

  registerAgent(input: RegisterAgentInput): Agent;
  listAgents(meshId: string, nodeId?: string): Agent[];

  createTask(input: CreateTaskInput): Task;
  updateTask(taskId: string, patch: UpdateTaskInput): Task | undefined;
  getTask(taskId: string): Task | undefined;
  listTasks(filters: { meshId: string; owner?: string; status?: string }): Task[];
  claimTask(taskId: string, agentId: string): Task | undefined;

  createMessage(input: CreateMessageInput): Message;
  listInbox(params: { meshId: string; agentId: string; unreadOnly: boolean }): Message[];
  listChannel(params: { meshId: string; since?: string }): Message[];
  listMessagesByTask(params: { meshId: string; taskId: string }): Message[];
  markMessageRead(messageId: string, agentId?: string): Message | undefined;

  getMetrics(): { meshes: number; tasks: Record<string, number>; agents: number; messages: number };

  recordHeartbeat(nodeId: string, meshId: string): void;
  markOfflineNodes(thresholdMs: number): void;
  isNodeOnline(nodeId: string): boolean;
  listNodes(meshId?: string): Array<{ id: string; meshId: string; lastHeartbeatAt: string; status: string }>;
  deleteNode(nodeId: string): boolean;
  resetTimeoutTasks(timeoutMs: number): number;
}
