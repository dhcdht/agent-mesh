#!/usr/bin/env node
import { Command } from "commander";
import { CliClient } from "./client.js";
import { runChat } from "./chat.js";

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
  .command("mesh:delete")
  .description("Delete a mesh")
  .requiredOption("--id <id>", "Mesh id")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const result = await client.request("DELETE", `/api/v1/meshes/${cmdOptions.id}`);
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
  .command("repo:list")
  .description("List repos in a mesh")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const result = await client.request("GET", `/api/v1/meshes/${cmdOptions.meshId}/repos`);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("agent:list")
  .description("List agents in a mesh")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .option("--node-id <nodeId>", "Filter by node id")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const query = new URLSearchParams({ meshId: cmdOptions.meshId });
    if (cmdOptions.nodeId) {
      query.set("nodeId", cmdOptions.nodeId);
    }
    const result = await client.request("GET", `/api/v1/agents?${query.toString()}`);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("node:list")
  .description("List nodes (optionally filter by mesh)")
  .option("--mesh-id <meshId>", "Filter by mesh id")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const query = cmdOptions.meshId ? `?meshId=${encodeURIComponent(cmdOptions.meshId)}` : "";
    const result = await client.request("GET", `/api/v1/nodes${query}`);
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
  .command("task:update")
  .description("Update a task")
  .requiredOption("--id <id>", "Task id")
  .requiredOption("--status <status>", "Task status (pending/in_progress/completed)")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const result = await client.request("PATCH", `/api/v1/tasks/${cmdOptions.id}`, {
      status: cmdOptions.status,
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
    const result = await client.request(
      "GET",
      `/api/v1/messages/${cmdOptions.agentId}/inbox?${query.toString()}`
    );
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("message:send")
  .description("Send a message to an agent (use --to * for broadcast to all agents)")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .requiredOption("--from <from>", "From agent id")
  .requiredOption("--to <to>", "To agent id (or * for broadcast)")
  .requiredOption("--type <type>", "Message type (request/question/answer/done/failed/broadcast/message)")
  .option("--payload <payload>", "JSON payload", "{}")
  .option("--task-id <taskId>", "Associated task id")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const body: Record<string, unknown> = {
      id: crypto.randomUUID(),
      meshId: cmdOptions.meshId,
      from: cmdOptions.from,
      to: cmdOptions.to,
      type: cmdOptions.type,
      payload: JSON.parse(cmdOptions.payload),
    };
    if (cmdOptions.taskId) {
      body.taskId = cmdOptions.taskId;
    }
    const result = await client.request("POST", "/api/v1/messages", body);
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("task:messages")
  .description("List messages for a task (task-based conversation history)")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .requiredOption("--task-id <taskId>", "Task id")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    const result = await client.request(
      "GET",
      `/api/v1/tasks/${encodeURIComponent(cmdOptions.taskId)}/messages?meshId=${encodeURIComponent(cmdOptions.meshId)}`
    );
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("chat")
  .description("交互式与 agents 交流：发消息、查看 agent 间讨论、任务进展")
  .requiredOption("--mesh-id <meshId>", "Mesh id")
  .action(async (cmdOptions) => {
    const global = program.opts<{ coordinator: string; apiKey?: string }>();
    const client = withClient(global);
    await runChat({
      client,
      meshId: cmdOptions.meshId,
      baseUrl: global.coordinator,
    });
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

// pnpm 会注入 "--" 作为首个参数，需过滤；Commander 需要完整 argv 格式
let args = process.argv.slice(2);
if (args[0] === "--") {
  args.shift();
}
program.parseAsync([process.argv[0], process.argv[1], ...args]).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});