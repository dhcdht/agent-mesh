import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { createStorage } from "./db.js";
import type { CoordinatorStorage } from "./types.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerMeshRoutes } from "./routes/meshes.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerRepoRoutes } from "./routes/repos.js";
import { registerTaskRoutes } from "./routes/tasks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

declare module "fastify" {
  interface FastifyInstance {
    storage: CoordinatorStorage;
  }
}

export async function buildServer(dbPath: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  app.decorate("storage", createStorage(dbPath));

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

  app.get("/dashboard", async (_request, reply) => {
    const html = readFileSync(join(__dirname, "public", "dashboard.html"), "utf-8");
    return reply.type("text/html").send(html);
  });

  await app.register(
    async (api) => {
      await registerMeshRoutes(api);
      await registerRepoRoutes(api);
      await registerAgentRoutes(api);
      await registerTaskRoutes(api);
      await registerMessageRoutes(api);
    },
    { prefix: "/api/v1" }
  );

  return app;
}

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  const dbPath = process.env.COORDINATOR_DB_PATH ?? "./agent-mesh.db";

  const app = await buildServer(dbPath);
  await app.listen({ port, host });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
