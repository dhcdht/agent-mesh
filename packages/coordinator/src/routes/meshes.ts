import type { FastifyInstance } from "fastify";
import { createMeshSchema, updateMeshSchema } from "../schemas.js";

const lifecycleTransitions: Record<string, string[]> = {
  created: ["running", "recycled"],
  running: ["completed", "recycled"],
  completed: ["recycled"],
  recycled: [],
};

export async function registerMeshRoutes(app: FastifyInstance): Promise<void> {
  app.get("/meshes", async (_request, reply) => {
    return reply.send({ items: app.storage.listMeshes() });
  });

  app.post("/meshes", async (request, reply) => {
    const parsed = createMeshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const mesh = app.storage.createMesh(parsed.data);
      return reply.code(201).send(mesh);
    } catch {
      return reply.code(409).send({ error: "mesh already exists" });
    }
  });

  app.get("/meshes/:meshId", async (request, reply) => {
    const { meshId } = request.params as { meshId: string };
    const mesh = app.storage.getMesh(meshId);
    if (!mesh) {
      return reply.code(404).send({ error: "mesh not found" });
    }
    return reply.send(mesh);
  });

  /** 群聊 channel：返回 mesh 内所有消息，按时间排序 */
  app.get("/meshes/:meshId/channel", async (request, reply) => {
    const { meshId } = request.params as { meshId: string };
    const { since } = request.query as { since?: string };
    const mesh = app.storage.getMesh(meshId);
    if (!mesh) {
      return reply.code(404).send({ error: "mesh not found" });
    }
    const items = app.storage.listChannel({ meshId, since });
    return reply.send({ items });
  });

  app.patch("/meshes/:meshId", async (request, reply) => {
    const { meshId } = request.params as { meshId: string };
    const parsed = updateMeshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const current = app.storage.getMesh(meshId);
    if (!current) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    if (parsed.data.status && parsed.data.status !== current.status) {
      const allowed = lifecycleTransitions[current.status] ?? [];
      if (!allowed.includes(parsed.data.status)) {
        return reply.code(409).send({
          error: `invalid mesh status transition: ${current.status} -> ${parsed.data.status}`,
        });
      }
    }

    const patch = {
      ...parsed.data,
      completedAt:
        parsed.data.completedAt ??
        (parsed.data.status === "completed" && !current.completedAt
          ? new Date().toISOString()
          : current.completedAt),
    };

    const updated = app.storage.updateMesh(meshId, patch);
    return reply.send(updated);
  });

  app.delete("/meshes/:meshId", async (request, reply) => {
    const { meshId } = request.params as { meshId: string };
    const current = app.storage.getMesh(meshId);
    if (!current) {
      return reply.code(404).send({ error: "mesh not found" });
    }
    const recycled = app.storage.updateMesh(meshId, { status: "recycled" });
    return reply.send(recycled);
  });
}
