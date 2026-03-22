import { FastifyInstance } from "fastify";

export async function registerPingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ping", async () => {
    return { ok: true, timestamp: new Date().toISOString() };
  });
}
