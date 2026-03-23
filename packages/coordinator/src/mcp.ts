import { createStorage } from "./db.js";
import { createMcpServer, StdioServerTransport } from "./mcp/server.js";

async function main() {
  const dbPath = process.env.COORDINATOR_DB_PATH || "./agent-mesh.db";
  const storage = createStorage(dbPath);
  const server = await createMcpServer(storage);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("Agent Mesh MCP Stdio Server running...");
}

main().catch((error) => {
  console.error("MCP Server Error:", error);
  process.exit(1);
});
