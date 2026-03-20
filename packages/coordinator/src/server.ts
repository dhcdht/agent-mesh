import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { createStorage } from "./db.js";
import { EventBus } from "./events.js";
import type { CoordinatorStorage } from "./types.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerMeshRoutes } from "./routes/meshes.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerNodeRoutes } from "./routes/nodes.js";
import { registerRepoRoutes } from "./routes/repos.js";
import { registerTaskRoutes } from "./routes/tasks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

declare module "fastify" {
  interface FastifyInstance {
    storage: CoordinatorStorage;
    eventBus: EventBus;
  }
}

export async function buildServer(dbPath: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.decorate("storage", createStorage(dbPath));
  app.decorate("eventBus", new EventBus());

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Agent Mesh Coordinator API",
        version: "0.1.0",
      },
    },
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: "/docs",
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/metrics", async (_request, reply) => {
    return reply.send(app.storage.getMetrics());
  });

  app.get("/dashboard", async (_request, reply) => {
    const html = readFileSync(join(__dirname, "public", "dashboard.html"), "utf-8");
    return reply.type("text/html").send(html);
  });

  await app.register(
    async (api) => {
      const apiKey = process.env.MESH_API_KEY;
      if (apiKey) {
        api.addHook("onRequest", async (request, reply) => {
          const auth = request.headers.authorization;
          const token = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
          if (token !== apiKey) {
            return reply.code(401).send({ error: "unauthorized", message: "Invalid or missing API key" });
          }
        });
      }
      await registerMeshRoutes(api);
      await registerRepoRoutes(api);
      await registerAgentRoutes(api);
      await registerNodeRoutes(api);
      await registerTaskRoutes(api);
      await registerMessageRoutes(api);
      await registerEventRoutes(api);
    },
    { prefix: "/api/v1" }
  );

  return app;
}

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;
const OFFLINE_CHECK_INTERVAL_MS = 30 * 1000;
const TASK_TIMEOUT_MS = 5 * 60 * 1000;
const MONITOR_INTERVAL_MS = 10 * 1000;

export function startBackgroundMonitor(storage: CoordinatorStorage): NodeJS.Timeout {
  return setInterval(() => {
    storage.markOfflineNodes(OFFLINE_THRESHOLD_MS);
    
    const count = storage.resetTimeoutTasks(TASK_TIMEOUT_MS);
    if (count > 0) {
      console.log(`[Monitor] Reset ${count} timeout tasks back to pending`);
    }
  }, MONITOR_INTERVAL_MS);
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  const dbPath = process.env.COORDINATOR_DB_PATH ?? "./agent-mesh.db";

  const app = await buildServer(dbPath);
  startBackgroundMonitor(app.storage);
  await app.listen({ port, host });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
