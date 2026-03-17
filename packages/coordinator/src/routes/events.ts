import type { FastifyInstance } from "fastify";

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { meshId?: string } }>("/events", async (request, reply) => {
    const { meshId } = request.query;
    if (!meshId) {
      return reply.code(400).send({ error: "meshId is required" });
    }
    if (!app.storage.getMesh(meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const unsubscribe = app.eventBus.subscribe(meshId, (event) => {
      const data = JSON.stringify({
        type: event.type,
        meshId: event.meshId,
        task: event.task,
        message: event.message,
      });
      reply.raw.write(`data: ${data}\n\n`);
    });

    request.raw.on("close", () => {
      unsubscribe();
    });
  });
}
