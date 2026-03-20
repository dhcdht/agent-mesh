import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

const cleanupPaths: string[] = [];

afterEach(() => {
  while (cleanupPaths.length > 0) {
    const dir = cleanupPaths.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

async function createApp() {
  const dir = mkdtempSync(join(tmpdir(), "agent-mesh-test-"));
  cleanupPaths.push(dir);
  const dbPath = join(dir, "coordinator.db");
  return buildServer(dbPath);
}

describe("coordinator api", () => {
  it("supports inbox and read flow", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-2", name: "mesh two" },
    });

    const send = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      payload: {
        id: "m1",
        meshId: "mesh-2",
        from: "agent-a",
        to: "agent-b",
        type: "message",
        payload: { text: "hello" },
      },
    });

    expect(send.statusCode).toBe(201);

    const inbox = await app.inject({
      method: "GET",
      url: "/api/v1/messages/agent-b/inbox?meshId=mesh-2&unreadOnly=true",
    });

    expect(inbox.statusCode).toBe(200);
    const data = inbox.json() as { items: Array<{ id: string; read: boolean }> };
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.read).toBe(false);

    const read = await app.inject({
      method: "POST",
      url: "/api/v1/messages/m1/read",
    });
    expect(read.statusCode).toBe(200);
    expect((read.json() as { read: boolean }).read).toBe(true);

    await app.close();
  });

  it("supports broadcast (to=*) and task-based messages", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-bc", name: "broadcast test" },
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/agents/register",
      payload: {
        id: "agent-x",
        meshId: "mesh-bc",
        name: "Agent X",
        repoId: "repo-x",
        cliType: "noop",
        cliConfig: {},
      },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/agents/register",
      payload: {
        id: "agent-y",
        meshId: "mesh-bc",
        name: "Agent Y",
        repoId: "repo-y",
        cliType: "noop",
        cliConfig: {},
      },
    });

    const broadcast = await app.inject({
      method: "POST",
      url: "/api/v1/messages",
      payload: {
        id: "bc1",
        meshId: "mesh-bc",
        from: "lead",
        to: "*",
        type: "broadcast",
        payload: { text: "hello all" },
        taskId: "task-1",
      },
    });
    expect(broadcast.statusCode).toBe(201);
    const bcData = broadcast.json() as { broadcast: boolean; message: { id: string; to: string } };
    expect(bcData.broadcast).toBe(true);
    expect(bcData.message).toBeDefined();
    expect(bcData.message.id).toBe("bc1");
    expect(bcData.message.to).toBe("*");

    const inboxX = await app.inject({
      method: "GET",
      url: "/api/v1/messages/agent-x/inbox?meshId=mesh-bc&unreadOnly=true",
    });
    expect(inboxX.statusCode).toBe(200);
    expect((inboxX.json() as { items: unknown[] }).items).toHaveLength(1);

    const taskMsgs = await app.inject({
      method: "GET",
      url: "/api/v1/tasks/task-1/messages?meshId=mesh-bc",
    });
    expect(taskMsgs.statusCode).toBe(200);
    const tmData = taskMsgs.json() as { items: Array<{ taskId?: string; from: string }> };
    expect(tmData.items.length).toBeGreaterThanOrEqual(1);
    expect(tmData.items.some((m) => m.from === "lead")).toBe(true);

    await app.close();
  });

  it("lists meshes and returns metrics", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-list", name: "list test" },
    });

    const list = await app.inject({ method: "GET", url: "/api/v1/meshes" });
    expect(list.statusCode).toBe(200);
    const listData = list.json() as { items: Array<{ id: string }> };
    expect(listData.items.some((m) => m.id === "mesh-list")).toBe(true);

    const metricsReq = await app.inject({ method: "GET", url: "/metrics" });
    expect(metricsReq.statusCode).toBe(200);
    const m = metricsReq.json() as { meshes: number; tasks: Record<string, number> };
    expect(m.meshes).toBeGreaterThanOrEqual(1);
    expect(typeof m.tasks).toBe("object");

    await app.close();
  });

  it("supports mesh lifecycle transition and recycle", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-3", name: "mesh three" },
    });

    const toRunning = await app.inject({
      method: "PATCH",
      url: "/api/v1/meshes/mesh-3",
      payload: { status: "running" },
    });
    expect(toRunning.statusCode).toBe(200);

    const toCompleted = await app.inject({
      method: "PATCH",
      url: "/api/v1/meshes/mesh-3",
      payload: { status: "completed" },
    });
    expect(toCompleted.statusCode).toBe(200);
    expect((toCompleted.json() as { completedAt?: string }).completedAt).toBeTruthy();

    const recycled = await app.inject({
      method: "DELETE",
      url: "/api/v1/meshes/mesh-3",
    });
    expect(recycled.statusCode).toBe(200);
    expect((recycled.json() as { status: string }).status).toBe("recycled");

    const invalid = await app.inject({
      method: "PATCH",
      url: "/api/v1/meshes/mesh-3",
      payload: { status: "running" },
    });
    expect(invalid.statusCode).toBe(409);

    await app.close();
  });

  it("supports heartbeat and nodeOnline in agents", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-hb", name: "heartbeat test" },
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/agents/register",
      payload: {
        id: "agent-hb",
        meshId: "mesh-hb",
        name: "Heartbeat Agent",
        repoId: "repo-hb",
        cliType: "noop",
        cliConfig: {},
        nodeId: "node-1",
      },
    });

    const agentsBefore = await app.inject({
      method: "GET",
      url: "/api/v1/agents?meshId=mesh-hb",
    });
    expect(agentsBefore.statusCode).toBe(200);
    const beforeData = agentsBefore.json() as { items: Array<{ nodeOnline?: boolean }> };
    expect(beforeData.items[0]?.nodeOnline).toBe(false);

    const hb = await app.inject({
      method: "POST",
      url: "/api/v1/nodes/node-1/heartbeat",
      payload: { meshId: "mesh-hb" },
    });
    expect(hb.statusCode).toBe(204);

    const agentsAfter = await app.inject({
      method: "GET",
      url: "/api/v1/agents?meshId=mesh-hb",
    });
    expect(agentsAfter.statusCode).toBe(200);
    const afterData = agentsAfter.json() as { items: Array<{ nodeOnline?: boolean }> };
    expect(afterData.items[0]?.nodeOnline).toBe(true);

    await app.close();
  });

  it("lists nodes with optional meshId filter", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-nodes", name: "nodes test" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/nodes/node-a/heartbeat",
      payload: { meshId: "mesh-nodes" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-other", name: "other" },
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/nodes/node-b/heartbeat",
      payload: { meshId: "mesh-other" },
    });

    const all = await app.inject({ method: "GET", url: "/api/v1/nodes" });
    expect(all.statusCode).toBe(200);
    const allData = all.json() as { items: Array<{ id: string; meshId: string }> };
    expect(allData.items.length).toBeGreaterThanOrEqual(2);

    const filtered = await app.inject({ method: "GET", url: "/api/v1/nodes?meshId=mesh-nodes" });
    expect(filtered.statusCode).toBe(200);
    const filteredData = filtered.json() as { items: Array<{ id: string; meshId: string }> };
    expect(filteredData.items.every((n) => n.meshId === "mesh-nodes")).toBe(true);

    const del = await app.inject({ method: "DELETE", url: "/api/v1/nodes/node-a" });
    expect(del.statusCode).toBe(204);

    const afterDel = await app.inject({ method: "GET", url: "/api/v1/nodes?meshId=mesh-nodes" });
    const afterData = afterDel.json() as { items: Array<{ id: string }> };
    expect(afterData.items.some((n) => n.id === "node-a")).toBe(false);

    const del404 = await app.inject({ method: "DELETE", url: "/api/v1/nodes/nonexistent" });
    expect(del404.statusCode).toBe(404);

    await app.close();
  });

  it("resets timeout tasks back to pending", async () => {
    const app = await createApp();

    await app.inject({
      method: "POST",
      url: "/api/v1/meshes",
      payload: { id: "mesh-timeout", name: "timeout test" },
    });

    await app.inject({
      method: "POST",
      url: "/api/v1/tasks",
      payload: {
        id: "task-t1",
        meshId: "mesh-timeout",
        subject: "Timeout Task",
        description: "will timeout",
        owner: "agent-1",
        repoId: "repo-1",
      },
    });

    await app.inject({
      method: "PATCH",
      url: "/api/v1/tasks/task-t1",
      payload: { status: "in_progress" },
    });

    const before = await app.inject({
      method: "GET",
      url: "/api/v1/tasks?meshId=mesh-timeout",
    });
    const beforeData = before.json() as { items: Array<{ status: string }> };
    expect(beforeData.items[0]?.status).toBe("in_progress");

    const resetCount = app.storage.resetTimeoutTasks(-1000); 
    expect(resetCount).toBeGreaterThanOrEqual(1);

    const after = await app.inject({
      method: "GET",
      url: "/api/v1/tasks?meshId=mesh-timeout",
    });
    const afterData = after.json() as { items: Array<{ status: string }> };
    expect(afterData.items[0]?.status).toBe("pending");

    await app.close();
  });
});
