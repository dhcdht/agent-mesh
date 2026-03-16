import type { FastifyInstance } from "fastify";
import { createMessageSchema } from "../schemas.js";
import type { CreateMessageInput } from "../types.js";

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  app.post("/messages", async (request, reply) => {
    const parsed = createMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    if (!app.storage.getMesh(parsed.data.meshId)) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    try {
      const message = app.storage.createMessage(parsed.data as CreateMessageInput);
      return reply.code(201).send(message);
    } catch {
      return reply.code(409).send({ error: "message already exists" });
    }
  });

  app.get("/messages/:agentId/inbox", async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const { meshId, unreadOnly } = request.query as { meshId?: string; unreadOnly?: string };
    if (!meshId) {
      return reply.code(400).send({ error: "meshId is required" });
    }

    return reply.send({
      items: app.storage.listInbox({
        meshId,
        agentId,
        unreadOnly: unreadOnly === "true",
      }),
    });
  });

  app.post("/messages/:messageId/read", async (request, reply) => {
    const { messageId } = request.params as { messageId: string };
    const message = app.storage.markMessageRead(messageId);
    if (!message) {
      return reply.code(404).send({ error: "message not found" });
    }
    return reply.send(message);
  });
}
