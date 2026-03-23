import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { registerMeshTools } from "./tools.js";
import type { CoordinatorStorage } from "../types.js";

export async function createMcpServer(storage: CoordinatorStorage) {
  const server = new McpServer({
    name: "agent-mesh-coordinator",
    version: "3.0.0",
  });

  registerMeshTools(server, storage);

  return server;
}

export { StdioServerTransport, SSEServerTransport };
