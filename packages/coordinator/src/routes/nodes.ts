import type { FastifyInstance } from "fastify";

export async function registerNodeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Params: { nodeId: string };
    Body: { meshId: string };
  }>("/nodes/:nodeId/heartbeat", {
    schema: {
      params: {
        type: "object",
        required: ["nodeId"],
        properties: { nodeId: { type: "string" } },
      },
      body: {
        type: "object",
        required: ["meshId"],
        properties: { meshId: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const { nodeId } = request.params;
    const { meshId } = request.body;

    if (!app.storage.getMesh(meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    app.storage.recordHeartbeat(nodeId, meshId);
    return reply.code(204).send();
  });

  app.get<{ Querystring: { meshId?: string } }>("/nodes", async (request, reply) => {
    const { meshId } = request.query;
    if (meshId && !app.storage.getMesh(meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }
    const items = app.storage.listNodes(meshId);
    return reply.send({ items });
  });
}
