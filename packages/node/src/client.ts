import type { Agent, Task } from "@agent-mesh/shared";

interface HttpClientOptions {
  baseUrl: string;
  apiKey?: string;
}

interface CreateMessageInput {
  id: string;
  meshId: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  taskId?: string;
}

export class CoordinatorClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} ${path}: ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async ensureMesh(mesh: { id: string; name: string }): Promise<void> {
    try {
      await this.request(`/api/v1/meshes/${mesh.id}`);
    } catch {
      await this.request("/api/v1/meshes", {
        method: "POST",
        body: JSON.stringify(mesh),
      });
    }
  }

  async ensureRepo(repo: {
    id: string;
    meshId: string;
    path: string;
    gitRemote?: string;
    agentId: string;
  }): Promise<void> {
    const repos = await this.request<{ items: Array<{ id: string }> }>(`/api/v1/meshes/${repo.meshId}/repos`);
    if (repos.items.some((item) => item.id === repo.id)) {
      return;
    }
    await this.request("/api/v1/repos", {
      method: "POST",
      body: JSON.stringify(repo),
    });
  }

  async registerAgent(agent: {
    id: string;
    meshId: string;
    name: string;
    repoId: string;
    cliType: string;
    cliConfig: Record<string, unknown>;
    nodeId: string;
  }): Promise<Agent> {
    return this.request<Agent>("/api/v1/agents/register", {
      method: "POST",
      body: JSON.stringify(agent),
    });
  }

  async listPendingTasks(meshId: string, owner: string): Promise<Task[]> {
    const response = await this.request<{ items: Task[] }>(
      `/api/v1/tasks?meshId=${encodeURIComponent(meshId)}&owner=${encodeURIComponent(owner)}&status=pending`
    );
    return response.items;
  }

  async markTaskStatus(taskId: string, status: "in_progress" | "completed"): Promise<void> {
    await this.request(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  async listInbox(
    meshId: string,
    agentId: string,
    unreadOnly = true
  ): Promise<Array<{ id: string; from: string; to: string; type: string; payload: unknown; taskId?: string }>> {
    const response = await this.request<{
      items: Array<{ id: string; from: string; to: string; type: string; payload: unknown; taskId?: string }>;
    }>(
      `/api/v1/messages/${encodeURIComponent(agentId)}/inbox?meshId=${encodeURIComponent(meshId)}&unreadOnly=${unreadOnly}`
    );
    return response.items;
  }

  async listMessagesByTask(
    meshId: string,
    taskId: string
  ): Promise<Array<{ id: string; from: string; to: string; type: string; payload: unknown; taskId?: string }>> {
    const response = await this.request<{
      items: Array<{ id: string; from: string; to: string; type: string; payload: unknown; taskId?: string }>;
    }>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/messages?meshId=${encodeURIComponent(meshId)}`
    );
    return response.items;
  }

  async listChannel(
    meshId: string,
    since?: string
  ): Promise<Array<{ id: string; from: string; to: string; type: string; payload: unknown; taskId?: string; timestamp?: string }>> {
    const q = since ? `?since=${encodeURIComponent(since)}` : "";
    const response = await this.request<{
      items: Array<{ id: string; from: string; to: string; type: string; payload: unknown; taskId?: string; timestamp?: string }>;
    }>(`/api/v1/meshes/${encodeURIComponent(meshId)}/channel${q}`);
    return response.items;
  }

  async markMessageRead(messageId: string, agentId?: string): Promise<void> {
    const q = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
    await this.request(`/api/v1/messages/${encodeURIComponent(messageId)}/read${q}`, {
      method: "POST",
      body: "{}",
    });
  }

  async sendMessage(input: CreateMessageInput): Promise<void> {
    await this.request("/api/v1/messages", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async heartbeat(nodeId: string, meshId: string): Promise<void> {
    await this.request(`/api/v1/nodes/${encodeURIComponent(nodeId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ meshId }),
    });
  }
}
