import type { FastifyInstance } from "fastify";
import { BROADCAST_RECIPIENT } from "@agent-mesh/shared";
import { createMessageSchema } from "../schemas.js";
import type { CreateMessageInput } from "../types.js";

/** 广播收件人别名 */
const BROADCAST_ALIASES = [BROADCAST_RECIPIENT, "all"];

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  app.post("/messages", async (request, reply) => {
    const parsed = createMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const mesh = app.storage.getMesh(parsed.data.meshId);
    if (!mesh) {
      return reply.code(404).send({ error: "mesh not found" });
    }

    const to = parsed.data.to;
    const isBroadcast = BROADCAST_ALIASES.includes(to);

    if (isBroadcast) {
      const agents = app.storage.listAgents(parsed.data.meshId);
      const recipients = agents
        .map((a) => a.id)
        .filter((id) => id !== parsed.data.from);
      const created: Array<{ id: string; to: string }> = [];
      for (const agentId of recipients) {
        const msgId = `${parsed.data.id}-${agentId}`;
        try {
          const m = app.storage.createMessage({
            ...parsed.data,
            id: msgId,
            to: agentId,
            type: parsed.data.type === "message" ? "broadcast" : parsed.data.type,
          } as CreateMessageInput);
          created.push({ id: m.id, to: m.to });
        } catch {
          // 已存在则跳过
        }
      }
      return reply.code(201).send({ broadcast: true, created });
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
