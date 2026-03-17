import type { FastifyInstance } from "fastify";
import { registerAgentSchema } from "../schemas.js";

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/agents/register", async (request, reply) => {
    const parsed = registerAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    if (!app.storage.getMesh(parsed.data.meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    const agent = app.storage.registerAgent(parsed.data);
    return reply.code(201).send(agent);
  });

  app.get("/agents", async (request, reply) => {
    const { meshId, nodeId } = request.query as { meshId?: string; nodeId?: string };
    if (!meshId) {
      return reply.code(400).send({ error: "meshId is required" });
    }
    const agents = app.storage.listAgents(meshId, nodeId);
    const items = agents.map((a) => ({
      ...a,
      nodeOnline: a.nodeId ? app.storage.isNodeOnline(a.nodeId) : undefined,
    }));
    return reply.send({ items });
  });
}
