import { hasCycle, type Agent, type Mesh, type Message, type Repo, type Task } from "@agent-mesh/shared";
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
      blocks TEXT NOT NULL,
      blocked_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(mesh_id) REFERENCES meshes(id)
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
      FOREIGN KEY(mesh_id) REFERENCES meshes(id)
    );
  `);

  const createMeshStmt = db.prepare(
    "INSERT INTO meshes (id, name, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?)"
  );
  const getMeshStmt = db.prepare("SELECT * FROM meshes WHERE id = ?");
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
  const listAgentsByMeshStmt = db.prepare("SELECT * FROM agents WHERE mesh_id = ?");
  const listAgentsByMeshAndNodeStmt = db.prepare(
    "SELECT * FROM agents WHERE mesh_id = ? AND node_id = ?"
  );

  const createTaskStmt = db.prepare(
    "INSERT INTO tasks (id, mesh_id, subject, description, status, owner, repo_id, blocks, blocked_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const getTaskStmt = db.prepare("SELECT * FROM tasks WHERE id = ?");
  const listTasksByMeshStmt = db.prepare("SELECT * FROM tasks WHERE mesh_id = ?");
  const listTasksByFilterStmt = db.prepare(
    "SELECT * FROM tasks WHERE mesh_id = ? AND (? IS NULL OR owner = ?) AND (? IS NULL OR status = ?)"
  );
  const updateTaskStmt = db.prepare(
    "UPDATE tasks SET subject = ?, description = ?, status = ?, owner = ?, repo_id = ?, blocks = ?, blocked_by = ?, updated_at = ? WHERE id = ?"
  );

  const createMessageStmt = db.prepare(
    "INSERT INTO messages (id, mesh_id, sender, recipient, type, payload, timestamp, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const listInboxStmt = db.prepare(
    "SELECT * FROM messages WHERE mesh_id = ? AND recipient = ? AND (? = 0 OR is_read = 0) ORDER BY timestamp ASC"
  );
  const markMessageReadStmt = db.prepare("UPDATE messages SET is_read = 1 WHERE id = ?");
  const getMessageStmt = db.prepare("SELECT * FROM messages WHERE id = ?");

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
      blocks: parseJson<string[]>(row.blocks),
      blockedBy: parseJson<string[]>(row.blocked_by),
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
        blocks: input.blocks ?? [],
        blockedBy: input.blockedBy ?? [],
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
        JSON.stringify(task.blocks),
        JSON.stringify(task.blockedBy),
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
        blocks: patch.blocks ?? current.blocks,
        blockedBy: patch.blockedBy ?? current.blockedBy,
        updatedAt: nowIso(),
      };
      updateTaskStmt.run(
        next.subject,
        next.description,
        next.status,
        next.owner,
        next.repoId,
        JSON.stringify(next.blocks),
        JSON.stringify(next.blockedBy),
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

    validateTaskGraph(meshId: string, candidate: Task): boolean {
      const tasks = listTasksByMeshStmt.all(meshId).map(mapTask);
      const filtered = tasks.filter((item) => item.id !== candidate.id);
      const merged = [...filtered, candidate].map((item) => ({ id: item.id, blockedBy: item.blockedBy }));
      return !hasCycle(merged);
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
      };
      createMessageStmt.run(
        message.id,
        message.meshId,
        message.from,
        message.to,
        message.type,
        JSON.stringify(message.payload),
        message.timestamp,
        0
      );
      return message;
    },

    listInbox(params: { meshId: string; agentId: string; unreadOnly: boolean }): Message[] {
      return listInboxStmt
        .all(params.meshId, params.agentId, params.unreadOnly ? 1 : 0)
        .map(mapMessage);
    },

    markMessageRead(messageId: string): Message | undefined {
      markMessageReadStmt.run(messageId);
      const row = getMessageStmt.get(messageId);
      return row ? mapMessage(row) : undefined;
    },
  };

  return storage;
}
