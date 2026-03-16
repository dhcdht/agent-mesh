import { resolve } from "node:path";
import { loadNodeConfig } from "./config.js";
import { runNode } from "./runner.js";

async function main(): Promise<void> {
  const argPath = process.argv[2] ?? "./config/mesh.example.yaml";
  const configPath = resolve(process.cwd(), argPath);
  const config = loadNodeConfig(configPath);

  console.log(`[node] starting with config: ${configPath}`);
  await runNode(config);
}

main().catch((error) => {
  console.error("[node] fatal error", error);
  process.exit(1);
});
