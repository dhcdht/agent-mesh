import { randomUUID } from "node:crypto";
import type { NodeConfig } from "./types.js";
import { createAdapter } from "./adapters/factory.js";
import { CoordinatorClient } from "./client.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runNode(config: NodeConfig): Promise<void> {
  const client = new CoordinatorClient({
    baseUrl: config.coordinator.url,
    apiKey: config.coordinator.apiKey ?? undefined,
  });

  await client.ensureMesh({
    id: config.mesh.id,
    name: config.mesh.name ?? config.mesh.id,
  });

  for (const repo of config.repos) {
    await client.ensureRepo({
      id: repo.id,
      meshId: config.mesh.id,
      path: repo.path,
      gitRemote: repo.gitRemote,
      agentId: repo.agent.id,
    });

    await client.registerAgent({
      id: repo.agent.id,
      meshId: config.mesh.id,
      name: repo.agent.name,
      repoId: repo.id,
      cliType: repo.agent.cliType,
      cliConfig: repo.agent.cliConfig,
      nodeId: config.node.id,
    });
  }

  while (true) {
    for (const repo of config.repos) {
      const agentId = repo.agent.id;
      const adapter = createAdapter(repo.agent.cliType, agentId, repo.agent.cliConfig);

      const inbox = await client.listInbox(config.mesh.id, agentId);
      for (const message of inbox) {
        console.log(
          `[node:${config.node.id}] inbox ${agentId} <- ${message.from}: ${JSON.stringify(message.payload)}`
        );
        await client.markMessageRead(message.id);
      }

      const tasks = await client.listPendingTasks(config.mesh.id, agentId);
      for (const task of tasks) {
        try {
          console.log(`[node:${config.node.id}] start task ${task.id} owner=${task.owner}`);
          await client.markTaskStatus(task.id, "in_progress");

          const result = await adapter.execute(task);

          await client.markTaskStatus(task.id, "completed");
          await client.sendMessage({
            id: randomUUID(),
            meshId: config.mesh.id,
            from: agentId,
            to: "lead",
            type: "task_completed",
            payload: {
              taskId: task.id,
              summary: result.summary,
              output: result.output,
            },
          });

          console.log(`[node:${config.node.id}] completed task ${task.id}`);
        } catch (error) {
          console.error(`[node:${config.node.id}] task failed ${task.id}`, error);
          await client.sendMessage({
            id: randomUUID(),
            meshId: config.mesh.id,
            from: agentId,
            to: "lead",
            type: "task_failed",
            payload: {
              taskId: task.id,
              error: String(error),
            },
          });
        }
      }
    }

    await sleep(config.node.pollIntervalMs);
  }
}
