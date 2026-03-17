import type { FastifyInstance } from "fastify";
import { createTaskSchema, updateTaskSchema } from "../schemas.js";

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.post("/tasks", async (request, reply) => {
    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    if (!app.storage.getMesh(parsed.data.meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    try {
      const created = app.storage.createTask(parsed.data);
      app.eventBus.emit({ type: "task.created", meshId: created.meshId, task: created });
      return reply.code(201).send(created);
    } catch {
      return reply.code(409).send({ error: "task already exists" });
    }
  });

  app.patch("/tasks/:taskId", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const parsed = updateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const current = app.storage.getTask(taskId);
    if (!current) {
      return reply.code(404).send({ error: "task not found" });
    }

    const updated = app.storage.updateTask(taskId, parsed.data);
    if (updated) {
      app.eventBus.emit({ type: "task.updated", meshId: updated.meshId, task: updated });
    }
    return reply.send(updated);
  });

  app.get("/tasks", async (request, reply) => {
    const { meshId, owner, status } = request.query as {
      meshId?: string;
      owner?: string;
      status?: string;
    };

    if (!meshId) {
      return reply.code(400).send({ error: "meshId is required" });
    }

    return reply.send({ items: app.storage.listTasks({ meshId, owner, status }) });
  });

  /** 按任务聚合会话历史（借鉴 Stream0 task-based conversation） */
  app.get("/tasks/:taskId/messages", async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const { meshId } = request.query as { meshId?: string };
    if (!meshId) {
      return reply.code(400).send({ error: "meshId is required" });
    }
    if (!app.storage.getMesh(meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }
    return reply.send({
      items: app.storage.listMessagesByTask({ meshId, taskId }),
    });
  });
}