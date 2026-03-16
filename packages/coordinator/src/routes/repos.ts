import type { FastifyInstance } from "fastify";
import { createRepoSchema } from "../schemas.js";

export async function registerRepoRoutes(app: FastifyInstance): Promise<void> {
  app.post("/repos", async (request, reply) => {
    const parsed = createRepoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    if (!app.storage.getMesh(parsed.data.meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    try {
      const repo = app.storage.createRepo(parsed.data);
      return reply.code(201).send(repo);
    } catch {
      return reply.code(409).send({ error: "repo already exists" });
    }
  });

  app.get("/meshes/:meshId/repos", async (request, reply) => {
    const { meshId } = request.params as { meshId: string };
    return reply.send({ items: app.storage.listRepos(meshId) });
  });
}
