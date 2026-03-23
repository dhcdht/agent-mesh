import { type FastifyInstance } from "fastify";
import { createMcpServer } from "../mcp/server.js";

export async function registerMcpRoutes(app: FastifyInstance): Promise<void> {
  const mcpServer = await createMcpServer(app.storage);

  app.get("/mcp/tools", async () => {
    // 调用 MCP SDK 提供的 listTools 方法
    const result = await mcpServer.listTools(undefined as any);
    return {
      items: result.tools || []
    };
  });
}
