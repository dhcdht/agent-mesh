import type { FastifyInstance } from "fastify";

const HEARTBEAT_BODY_SCHEMA = {
  type: "object",
  required: ["meshId"],
  properties: {
    meshId: { type: "string" },
  },
} as const;

export async function registerNodeRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Params: { nodeId: string };
    Body: { meshId: string };
  }>("/nodes/:nodeId/heartbeat", {
    schema: {
      params: { nodeId: { type: "string" } },
      body: HEARTBEAT_BODY_SCHEMA,
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
}
