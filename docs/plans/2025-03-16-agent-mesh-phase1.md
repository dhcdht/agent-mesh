# Agent Mesh Phase 1 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 Coordinator 协调层 MVP，包括 API 服务、SQLite 存储、基础 CLI，支持创建 mesh、添加 repo、创建任务、消息收发。

**Architecture:** 单体 monorepo，packages/shared 存放类型与工具，packages/coordinator 为 Fastify API，apps/cli 为 Commander CLI。SQLite 存储，无认证（Phase 1 简化）。

**Tech Stack:** Node.js 20+, TypeScript, Fastify, better-sqlite3, Commander, pino

---

## Task 1: 项目初始化与共享类型

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/dag.ts`
- Test: `packages/shared/src/dag.test.ts`

**Step 1: 初始化根 package.json**

```json
{
  "name": "agent-mesh",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "dev": "pnpm -r run dev"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

**Step 2: 创建 shared 包与类型**

```typescript
// packages/shared/src/types.ts
export type MeshStatus = 'created' | 'running' | 'completed' | 'recycled';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';
export type AgentStatus = 'idle' | 'busy' | 'offline';

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
```

**Step 3: 实现 DAG 循环检测**

```typescript
// packages/shared/src/dag.ts
export function hasCycle(tasks: { id: string; blockedBy: string[] }[]): boolean {
  const graph = new Map<string, string[]>();
  for (const t of tasks) {
    graph.set(t.id, t.blockedBy || []);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string): boolean {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const dep of graph.get(node) || []) {
      if (dfs(dep)) return true;
    }
    stack.delete(node);
    return false;
  }

  for (const t of tasks) {
    if (!visited.has(t.id) && dfs(t.id)) return true;
  }
  return false;
}
```

**Step 4: 编写 DAG 测试并验证**

```bash
pnpm test --filter shared
```

---

## Task 2: SQLite 存储层

**Files:**
- Create: `packages/coordinator/package.json`
- Create: `packages/coordinator/src/db/schema.ts`
- Create: `packages/coordinator/src/db/store.ts`
- Test: `packages/coordinator/src/db/store.test.ts`

**Step 1: 初始化 coordinator 包**

```json
{
  "name": "@agent-mesh/coordinator",
  "version": "0.1.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@agent-mesh/shared": "workspace:*",
    "better-sqlite3": "^9.2.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "tsx": "^4.0.0"
  }
}
```

**Step 2: 创建 schema 与迁移**

```sql
-- packages/coordinator/src/db/schema.sql
CREATE TABLE IF NOT EXISTS meshes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  mesh_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  owner TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  blocks TEXT NOT NULL DEFAULT '[]',
  blocked_by TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (mesh_id) REFERENCES meshes(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  mesh_id TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  timestamp TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (mesh_id) REFERENCES meshes(id)
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  mesh_id TEXT NOT NULL,
  name TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  cli_type TEXT NOT NULL,
  cli_config TEXT NOT NULL DEFAULT '{}',
  node_id TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  FOREIGN KEY (mesh_id) REFERENCES meshes(id)
);

CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  mesh_id TEXT NOT NULL,
  path TEXT NOT NULL,
  git_remote TEXT,
  agent_id TEXT NOT NULL,
  FOREIGN KEY (mesh_id) REFERENCES meshes(id)
);

CREATE INDEX idx_tasks_mesh_id ON tasks(mesh_id);
CREATE INDEX idx_tasks_owner ON tasks(owner);
CREATE INDEX idx_messages_mesh_to ON messages(mesh_id, "to");
```

**Step 3: 实现 Store 类（CRUD + DAG 校验）**

**Step 4: 编写 Store 测试**

---

## Task 3: Coordinator API 路由

**Files:**
- Create: `packages/coordinator/src/routes/meshes.ts`
- Create: `packages/coordinator/src/routes/tasks.ts`
- Create: `packages/coordinator/src/routes/messages.ts`
- Create: `packages/coordinator/src/routes/agents.ts`
- Create: `packages/coordinator/src/routes/repos.ts`
- Create: `packages/coordinator/src/index.ts`

**Step 1: 实现 Mesh 路由**

- POST /api/v1/meshes
- GET /api/v1/meshes/:meshId
- PATCH /api/v1/meshes/:meshId
- DELETE /api/v1/meshes/:meshId

**Step 2: 实现 Task 路由（含 DAG 校验）**

- POST /api/v1/meshes/:meshId/tasks
- GET /api/v1/meshes/:meshId/tasks
- GET /api/v1/meshes/:meshId/tasks/:taskId
- PATCH /api/v1/meshes/:meshId/tasks/:taskId

**Step 3: 实现 Message、Agent、Repo 路由**

**Step 4: 组装 Fastify 应用并启动**

---

## Task 4: 基础 CLI

**Files:**
- Create: `apps/cli/package.json`
- Create: `apps/cli/src/index.ts`
- Create: `apps/cli/src/commands/mesh.ts`
- Create: `apps/cli/src/commands/task.ts`

**Step 1: 初始化 CLI 包**

```json
{
  "name": "@agent-mesh/cli",
  "version": "0.1.0",
  "bin": { "mesh": "dist/index.js" },
  "dependencies": {
    "commander": "^12.0.0",
    "node-fetch": "^3.3.0"
  }
}
```

**Step 2: 实现 mesh create / list / delete**

**Step 3: 实现 task create / list**

**Step 4: 实现 repo add**

---

## Task 5: 集成测试与调试

**Files:**
- Create: `tests/integration/coordinator.test.ts`
- Create: `scripts/dev.sh`

**Step 1: 编写集成测试**

- 启动 Coordinator，创建 mesh，添加 repo，创建任务，验证 API 返回

**Step 2: 手动 E2E 验证**

```bash
# 终端 1: 启动 Coordinator
pnpm --filter @agent-mesh/coordinator dev

# 终端 2: 使用 CLI
pnpm --filter @agent-mesh/cli exec mesh create my-mesh
pnpm --filter @agent-mesh/cli exec mesh task create my-mesh --subject "测试任务" --repo repo-1
```

**Step 3: 修复发现的问题**

---

## 执行顺序

1. Task 1 → Task 2 → Task 3 → Task 4 → Task 5
2. 每 Task 完成后运行测试
3. 每 Task 完成后 commit
