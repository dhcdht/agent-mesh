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
      const candidate = {
        ...parsed.data,
        status: "pending" as const,
        blocks: parsed.data.blocks ?? [],
        blockedBy: parsed.data.blockedBy ?? [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (!app.storage.validateTaskGraph(parsed.data.meshId, candidate)) {
        return reply.code(409).send({ error: "task dependency cycle detected" });
      }

      const created = app.storage.createTask(parsed.data);
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

    const candidate = {
      ...current,
      ...parsed.data,
      blocks: parsed.data.blocks ?? current.blocks,
      blockedBy: parsed.data.blockedBy ?? current.blockedBy,
    };

    if (!app.storage.validateTaskGraph(current.meshId, candidate)) {
      return reply.code(409).send({ error: "task dependency cycle detected" });
    }

    const updated = app.storage.updateTask(taskId, parsed.data);
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
}
