import { type Agent, type Mesh, type Message, type Repo, type Task } from "@agent-mesh/shared";
import Database from "better-sqlite3";
import type {
  CoordinatorStorage,
  CreateMeshInput,
  CreateMessageInput,
  CreateRepoInput,
  CreateTaskInput,
  RegisterAgentInput,
  UpdateMeshInput,
  UpdateTaskInput,
} from "./types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function createStorage(dbPath: string): CoordinatorStorage {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS meshes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      mesh_id TEXT NOT NULL,
      path TEXT NOT NULL,
      git_remote TEXT,
      agent_id TEXT NOT NULL,
      FOREIGN KEY(mesh_id) REFERENCES meshes(id)
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      mesh_id TEXT NOT NULL,
      name TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      cli_type TEXT NOT NULL,
      cli_config TEXT NOT NULL,
      node_id TEXT,
      status TEXT NOT NULL,
      FOREIGN KEY(mesh_id) REFERENCES meshes(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      mesh_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo_id TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(mesh_id) REFERENCES meshes(id),
      FOREIGN KEY(parent_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      mesh_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      is_read INTEGER NOT NULL,
      task_id TEXT,
      FOREIGN KEY(mesh_id) REFERENCES meshes(id)
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      mesh_id TEXT NOT NULL,
      last_heartbeat_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      FOREIGN KEY(mesh_id) REFERENCES meshes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_mesh_status ON tasks(mesh_id, status);
    CREATE INDEX IF NOT EXISTS idx_tasks_mesh_owner ON tasks(mesh_id, owner);
    CREATE INDEX IF NOT EXISTS idx_messages_mesh_recipient ON messages(mesh_id, recipient);
    CREATE INDEX IF NOT EXISTS idx_messages_mesh_task ON messages(mesh_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_messages_mesh_timestamp ON messages(mesh_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_nodes_mesh ON nodes(mesh_id);
    CREATE INDEX IF NOT EXISTS idx_agents_mesh ON agents(mesh_id);
  `);

  // Migration: add task_id if table existed without it
  try {
    db.exec("ALTER TABLE messages ADD COLUMN task_id TEXT");
  } catch (_) {
    // column already exists
  }

  // Migration: message_read for broadcast (to="*") per-agent read tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_read (
      message_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      PRIMARY KEY (message_id, agent_id),
      FOREIGN KEY (message_id) REFERENCES messages(id)
    );
    CREATE INDEX IF NOT EXISTS idx_message_read_agent ON message_read(agent_id);
  `);

  const createMeshStmt = db.prepare(
    "INSERT INTO meshes (id, name, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?)"
  );
  const getMeshStmt = db.prepare("SELECT * FROM meshes WHERE id = ?");
  const listMeshesStmt = db.prepare("SELECT * FROM meshes ORDER BY created_at DESC");
  const updateMeshStmt = db.prepare(
    "UPDATE meshes SET name = ?, status = ?, completed_at = ? WHERE id = ?"
  );

  const createRepoStmt = db.prepare(
    "INSERT INTO repos (id, mesh_id, path, git_remote, agent_id) VALUES (?, ?, ?, ?, ?)"
  );
  const listReposStmt = db.prepare("SELECT * FROM repos WHERE mesh_id = ?");

  const upsertAgentStmt = db.prepare(`
    INSERT INTO agents (id, mesh_id, name, repo_id, cli_type, cli_config, node_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      mesh_id=excluded.mesh_id,
      name=excluded.name,
      repo_id=excluded.repo_id,
      cli_type=excluded.cli_type,
      cli_config=excluded.cli_config,
      node_id=excluded.node_id,
      status=excluded.status
  `);
  const listAgentsByMeshStmt = db.prepare(`
    SELECT a.*, n.status as node_status 
    FROM agents a 
    LEFT JOIN nodes n ON a.node_id = n.id 
    WHERE a.mesh_id = ?
  `);
  const listAgentsByMeshAndNodeStmt = db.prepare(`
    SELECT a.*, n.status as node_status 
    FROM agents a 
    LEFT JOIN nodes n ON a.node_id = n.id 
    WHERE a.mesh_id = ? AND a.node_id = ?
  `);

  const createTaskStmt = db.prepare(
    "INSERT INTO tasks (id, mesh_id, subject, description, status, owner, repo_id, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const getTaskStmt = db.prepare("SELECT * FROM tasks WHERE id = ?");
  const listTasksByMeshStmt = db.prepare("SELECT * FROM tasks WHERE mesh_id = ?");
  const listTasksByFilterStmt = db.prepare(
    "SELECT * FROM tasks WHERE mesh_id = ? AND (? IS NULL OR owner = ?) AND (? IS NULL OR status = ?)"
  );
  const updateTaskStmt = db.prepare(
    "UPDATE tasks SET subject = ?, description = ?, status = ?, owner = ?, repo_id = ?, updated_at = ? WHERE id = ?"
  );
  const claimTaskStmt = db.prepare(
    "UPDATE tasks SET owner = ?, status = 'in_progress', updated_at = ? WHERE id = ? AND (owner = '' OR owner IS NULL) AND status = 'pending'"
  );

  const createMessageStmt = db.prepare(
    "INSERT INTO messages (id, mesh_id, sender, recipient, type, payload, timestamp, is_read, task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const listInboxStmt = db.prepare(`
    SELECT m.* FROM messages m
    WHERE m.mesh_id = ? AND (
      (m.recipient = ? AND (? = 0 OR m.is_read = 0))
      OR (m.recipient = '*' AND (? = 0 OR NOT EXISTS (
        SELECT 1 FROM message_read mr WHERE mr.message_id = m.id AND mr.agent_id = ?
      )))
    )
    ORDER BY m.timestamp ASC
  `);
  const listChannelStmt = db.prepare(
    "SELECT * FROM messages WHERE mesh_id = ? AND (? IS NULL OR timestamp > ?) ORDER BY timestamp ASC"
  );
  const insertMessageReadStmt = db.prepare(
    "INSERT OR IGNORE INTO message_read (message_id, agent_id) VALUES (?, ?)"
  );
  const listMessagesByTaskStmt = db.prepare(
    "SELECT * FROM messages WHERE mesh_id = ? AND task_id = ? ORDER BY timestamp ASC"
  );
  const markMessageReadStmt = db.prepare("UPDATE messages SET is_read = 1 WHERE id = ?");
  const getMessageStmt = db.prepare("SELECT * FROM messages WHERE id = ?");
  const countMeshesStmt = db.prepare("SELECT COUNT(*) as c FROM meshes");
  const countTasksByStatusStmt = db.prepare("SELECT status, COUNT(*) as c FROM tasks GROUP BY status");
  const countAgentsStmt = db.prepare("SELECT COUNT(*) as c FROM agents");
  const countMessagesStmt = db.prepare("SELECT COUNT(*) as c FROM messages");

  const upsertNodeHeartbeatStmt = db.prepare(`
    INSERT INTO nodes (id, mesh_id, last_heartbeat_at, status)
    VALUES (?, ?, ?, 'online')
    ON CONFLICT(id) DO UPDATE SET
      mesh_id = excluded.mesh_id,
      last_heartbeat_at = excluded.last_heartbeat_at,
      status = 'online'
  `);
  const getNodeStatusStmt = db.prepare("SELECT status FROM nodes WHERE id = ?");
  const listNodesStmt = db.prepare("SELECT id, mesh_id, last_heartbeat_at, status FROM nodes ORDER BY last_heartbeat_at DESC");
  const listNodesByMeshStmt = db.prepare("SELECT id, mesh_id, last_heartbeat_at, status FROM nodes WHERE mesh_id = ? ORDER BY last_heartbeat_at DESC");
  const deleteNodeStmt = db.prepare("DELETE FROM nodes WHERE id = ?");
  const markOfflineNodesStmt = db.prepare(`
    UPDATE nodes SET status = 'offline'
    WHERE last_heartbeat_at < ?
  `);
  const resetTimeoutTasksStmt = db.prepare(`
    UPDATE tasks SET status = 'pending', updated_at = ?
    WHERE status = 'in_progress' AND updated_at < ?
  `);

  function mapMesh(row: any): Mesh {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    };
  }

  function mapRepo(row: any): Repo {
    return {
      id: row.id,
      meshId: row.mesh_id,
      path: row.path,
      gitRemote: row.git_remote ?? undefined,
      agentId: row.agent_id,
    };
  }

  function mapAgent(row: any): Agent {
    return {
      id: row.id,
      meshId: row.mesh_id,
      name: row.name,
      repoId: row.repo_id,
      cliType: row.cli_type,
      cliConfig: parseJson<Record<string, unknown>>(row.cli_config),
      nodeId: row.node_id ?? undefined,
      status: row.status,
      nodeOnline: row.node_status === "online" || storage.isNodeOnline(row.node_id),
    };
  }

  function mapTask(row: any): Task {
    return {
      id: row.id,
      meshId: row.mesh_id,
      subject: row.subject,
      description: row.description,
      status: row.status,
      owner: row.owner,
      repoId: row.repo_id,
      parentId: row.parent_id ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function mapMessage(row: any): Message {
    return {
      id: row.id,
      meshId: row.mesh_id,
      from: row.sender,
      to: row.recipient,
      type: row.type,
      payload: parseJson<unknown>(row.payload),
      timestamp: row.timestamp,
      read: row.is_read === 1,
      taskId: row.task_id ?? undefined,
    };
  }

  const storage: CoordinatorStorage = {
    createMesh(input: CreateMeshInput): Mesh {
      const mesh: Mesh = {
        id: input.id,
        name: input.name,
        status: "created",
        createdAt: nowIso(),
      };
      createMeshStmt.run(mesh.id, mesh.name, mesh.status, mesh.createdAt, null);
      return mesh;
    },

    getMesh(id: string): Mesh | undefined {
      const row = getMeshStmt.get(id);
      return row ? mapMesh(row) : undefined;
    },

    listMeshes(): Mesh[] {
      return listMeshesStmt.all().map((row: any) => mapMesh(row));
    },

    updateMesh(id: string, patch: UpdateMeshInput): Mesh | undefined {
      const current = storage.getMesh(id);
      if (!current) {
        return undefined;
      }
      const next: Mesh = {
        ...current,
        ...patch,
        completedAt: patch.completedAt ?? current.completedAt,
      };
      updateMeshStmt.run(next.name, next.status, next.completedAt ?? null, id);
      return next;
    },

    createRepo(input: CreateRepoInput): Repo {
      createRepoStmt.run(input.id, input.meshId, input.path, input.gitRemote ?? null, input.agentId);
      return {
        id: input.id,
        meshId: input.meshId,
        path: input.path,
        gitRemote: input.gitRemote,
        agentId: input.agentId,
      };
    },

    listRepos(meshId: string): Repo[] {
      return listReposStmt.all(meshId).map(mapRepo);
    },

    registerAgent(input: RegisterAgentInput): Agent {
      const status = input.status ?? "idle";
      upsertAgentStmt.run(
        input.id,
        input.meshId,
        input.name,
        input.repoId,
        input.cliType,
        JSON.stringify(input.cliConfig),
        input.nodeId ?? null,
        status
      );
      return {
        id: input.id,
        meshId: input.meshId,
        name: input.name,
        repoId: input.repoId,
        cliType: input.cliType,
        cliConfig: input.cliConfig,
        nodeId: input.nodeId,
        status,
      };
    },

    listAgents(meshId: string, nodeId?: string): Agent[] {
      const rows = nodeId
        ? listAgentsByMeshAndNodeStmt.all(meshId, nodeId)
        : listAgentsByMeshStmt.all(meshId);
      return rows.map(mapAgent);
    },

createTask(input: CreateTaskInput): Task {
  const now = nowIso();
    const task: Task = {
      id: input.id,
      meshId: input.meshId,
      subject: input.subject,
      description: input.description,
      status: "pending",
      owner: input.owner,
      repoId: input.repoId,
      parentId: input.parentId,
      createdAt: now,
      updatedAt: now,
    };
    createTaskStmt.run(
      task.id,
      task.meshId,
      task.subject,
      task.description,
      task.status,
      task.owner,
      task.repoId,
      task.parentId ?? null,
      task.createdAt,
      task.updatedAt
    );
  return task;
},

    getTask(taskId: string): Task | undefined {
      const row = getTaskStmt.get(taskId);
      return row ? mapTask(row) : undefined;
    },

updateTask(taskId: string, patch: UpdateTaskInput): Task | undefined {
  const current = storage.getTask(taskId);
  if (!current) {
    return undefined;
  }
  const next: Task = {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  };
  updateTaskStmt.run(
    next.subject,
    next.description,
    next.status,
    next.owner,
    next.repoId,
    next.updatedAt,
    taskId
  );
  return next;
},

  listTasks(filters: { meshId: string; owner?: string; status?: string }): Task[] {
    const rows = listTasksByFilterStmt.all(
      filters.meshId,
      filters.owner ?? null,
      filters.owner ?? null,
      filters.status ?? null,
      filters.status ?? null
    );
    return rows.map(mapTask);
  },

  claimTask(taskId: string, agentId: string): Task | undefined {
    const now = nowIso();
    const result = claimTaskStmt.run(agentId, now, taskId);
    if ((result as { changes: number }).changes > 0) {
      return storage.getTask(taskId);
    }
    return undefined;
  },

  createMessage(input: CreateMessageInput): Message {

    const message: Message = {
      id: input.id,
      meshId: input.meshId,
      from: input.from,
      to: input.to,
      type: input.type,
      payload: input.payload,
      timestamp: nowIso(),
      read: false,
      taskId: input.taskId,
    };
    createMessageStmt.run(
      message.id,
      message.meshId,
      message.from,
      message.to,
      message.type,
      JSON.stringify(message.payload),
      message.timestamp,
      0,
      message.taskId ?? null
    );
    return message;
  },

  listInbox(params: { meshId: string; agentId: string; unreadOnly: boolean }): Message[] {
    const u = params.unreadOnly ? 1 : 0;
    return listInboxStmt
      .all(params.meshId, params.agentId, u, u, params.agentId)
      .map(mapMessage);
  },

  listChannel(params: { meshId: string; since?: string }): Message[] {
    return listChannelStmt
      .all(params.meshId, params.since ?? null, params.since ?? null)
      .map(mapMessage);
  },

  listMessagesByTask(params: { meshId: string; taskId: string }): Message[] {
    return listMessagesByTaskStmt.all(params.meshId, params.taskId).map(mapMessage);
  },

  markMessageRead(messageId: string, agentId?: string): Message | undefined {
    const row = getMessageStmt.get(messageId) as { recipient: string } | undefined;
    if (!row) return undefined;
    if (row.recipient === "*") {
      if (agentId) insertMessageReadStmt.run(messageId, agentId);
    } else {
      markMessageReadStmt.run(messageId);
    }
    const msg = getMessageStmt.get(messageId);
    return msg ? mapMessage(msg) : undefined;
  },

  getMetrics(): { meshes: number; tasks: Record<string, number>; agents: number; messages: number } {
    const meshes = (countMeshesStmt.get() as { c: number }).c;
    const agents = (countAgentsStmt.get() as { c: number }).c;
    const messages = (countMessagesStmt.get() as { c: number }).c;
    const taskRows = countTasksByStatusStmt.all() as { status: string; c: number }[];
    const tasks: Record<string, number> = {};
    for (const row of taskRows) {
      tasks[row.status] = row.c;
    }
    return { meshes, tasks, agents, messages };
  },

  recordHeartbeat(nodeId: string, meshId: string): void {
    upsertNodeHeartbeatStmt.run(nodeId, meshId, nowIso());
  },

  markOfflineNodes(thresholdMs: number): void {
    const threshold = new Date(Date.now() - thresholdMs).toISOString();
    markOfflineNodesStmt.run(threshold);
  },

  isNodeOnline(nodeId: string): boolean {
    const row = getNodeStatusStmt.get(nodeId) as { status: string } | undefined;
    return row?.status === "online";
  },

  listNodes(meshId?: string): Array<{ id: string; meshId: string; lastHeartbeatAt: string; status: string }> {
    const rows = meshId
      ? listNodesByMeshStmt.all(meshId)
      : listNodesStmt.all();
    return (rows as Array<{ id: string; mesh_id: string; last_heartbeat_at: string; status: string }>).map((r) => ({
      id: r.id,
      meshId: r.mesh_id,
      lastHeartbeatAt: r.last_heartbeat_at,
      status: r.status,
    }));
  },

  deleteNode(nodeId: string): boolean {
    const result = deleteNodeStmt.run(nodeId);
    return (result as { changes: number }).changes > 0;
  },

  resetTimeoutTasks(timeoutMs: number): number {
    const now = nowIso();
    const threshold = new Date(Date.now() - timeoutMs).toISOString();
    const result = resetTimeoutTasksStmt.run(now, threshold);
    return (result as { changes: number }).changes;
  },
};

return storage;
}

