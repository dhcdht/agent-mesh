#!/usr/bin/env node
import { Command } from "commander";
import { CliClient } from "./client.js";

function withClient(options: { coordinator: string; apiKey?: string }): CliClient {
  return new CliClient({
    baseUrl: options.coordinator,
    apiKey: options.apiKey,
  });
}

const program = new Command();
program.name("agent-mesh").description("Agent Mesh CLI").version("0.1.0");

program
  .option("-c, --coordinator <url>", "Coordinator URL", process.env.MESH_COORDINATOR_URL ?? "http://localhost:3000")
  .option("--api-key <key>", "API key", process.env.MESH_API_KEY);

program
  .command("mesh:create")
  .requiredOption("--id <id>", "Mesh id")
  .requiredOption("--name <name>", "Mesh name")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const result = await client.request("POST", "/api/v1/meshes", {
      id: cmdOptions.id,
      name: cmdOptions.name,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("mesh:list")
  .description("List all meshes")
  .action(async () => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const result = await client.request("GET", "/api/v1/meshes");
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("repo:add")
  .requiredOption("--id <id>", "Repo id")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .requiredOption("--path <path>", "Repo path")
  .requiredOption("--agent-id <agentId>", "Agent id")
  .option("--git-remote <gitRemote>", "Git remote")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const result = await client.request("POST", "/api/v1/repos", {
      id: cmdOptions.id,
      meshId: cmdOptions.meshId,
      path: cmdOptions.path,
      gitRemote: cmdOptions.gitRemote,
      agentId: cmdOptions.agentId,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("task:create")
  .requiredOption("--id <id>", "Task id")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .requiredOption("--subject <subject>", "Task subject")
  .requiredOption("--description <description>", "Task description")
  .requiredOption("--owner <owner>", "Task owner agent id")
  .requiredOption("--repo-id <repoId>", "Repo id")
  .option("--blocked-by <taskIds>", "Comma separated task ids")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const blockedBy = cmdOptions.blockedBy
      ? String(cmdOptions.blockedBy)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : undefined;

    const result = await client.request("POST", "/api/v1/tasks", {
      id: cmdOptions.id,
      meshId: cmdOptions.meshId,
      subject: cmdOptions.subject,
      description: cmdOptions.description,
      owner: cmdOptions.owner,
      repoId: cmdOptions.repoId,
      blockedBy,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("inbox:list")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .requiredOption("--agent-id <agentId>", "Agent id")
  .option("--unread-only", "Unread only", false)
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const query = new URLSearchParams({
      meshId: cmdOptions.meshId,
      unreadOnly: cmdOptions.unreadOnly ? "true" : "false",
    });
    const result = await client.request("GET", `/api/v1/messages/${cmdOptions.agentId}/inbox?${query.toString()}`);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("task:list")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .option("--owner <owner>", "Owner agent id")
  .option("--status <status>", "Task status")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const query = new URLSearchParams({ meshId: cmdOptions.meshId });
    if (cmdOptions.owner) {
      query.set("owner", cmdOptions.owner);
    }
    if (cmdOptions.status) {
      query.set("status", cmdOptions.status);
    }
    const result = await client.request("GET", `/api/v1/tasks?${query.toString()}`);
    console.log(JSON.stringify(result, null, 2));
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
