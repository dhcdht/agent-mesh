import { randomUUID } from "node:crypto";
import { BROADCAST_RECIPIENT } from "@agent-mesh/shared";
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

  const adapters = new Map<string, ReturnType<typeof createAdapter>>();

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

    adapters.set(repo.agent.id, createAdapter(repo.agent.cliType, repo.agent.id, repo.agent.cliConfig, repo.path));
  }

  while (true) {
    for (const repo of config.repos) {
      const agentId = repo.agent.id;
      const adapter = adapters.get(agentId)!;

      const inbox = await client.listInbox(config.mesh.id, agentId, true);
      const isStdinArgsOnly =
        repo.agent.cliType === "stdin" && (repo.agent.cliConfig as { argsOnly?: boolean })?.argsOnly === true;

      for (const message of inbox) {
        console.log(
          `[node:${config.node.id}] inbox ${agentId} <- ${message.from} (${message.type}): ${JSON.stringify(message.payload)}`
        );

        // Chat-style: lead 发来的 message/broadcast 触发 agent 立即执行并回复
        const payload = message.payload as Record<string, unknown>;
        const text = (payload?.text ?? payload?.summary ?? JSON.stringify(payload)) as string;
        const isChatType = message.type === "message" || message.type === "broadcast";

        if (isChatType && text && !isStdinArgsOnly) {
          const syntheticTask = {
            id: `msg-${message.id}`,
            meshId: config.mesh.id,
            subject: `Reply to ${message.from}`,
            description: text,
            status: "pending" as const,
            owner: agentId,
            repoId: repo.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          try {
            console.log(`[node:${config.node.id}] chat-style reply ${agentId} -> group`);
            const result = await adapter.execute(syntheticTask);
            await client.sendMessage({
              id: randomUUID(),
              meshId: config.mesh.id,
              from: agentId,
              to: BROADCAST_RECIPIENT,
              type: "message",
              payload: { text: result.summary, output: result.output },
              taskId: message.taskId,
            });
          } catch (e) {
            console.error(`[node:${config.node.id}] chat-style reply failed:`, e);
            await client.sendMessage({
              id: randomUUID(),
              meshId: config.mesh.id,
              from: agentId,
              to: BROADCAST_RECIPIENT,
              type: "message",
              payload: { error: String(e) },
              taskId: message.taskId,
            });
          }
        } else if (adapter.deliverMessage) {
          try {
            const result = await adapter.deliverMessage({
              id: message.id,
              from: message.from,
              to: message.to,
              type: message.type,
              payload: message.payload,
              taskId: message.taskId,
            });
            if (result.status === "failed") {
              console.error(`[node:${config.node.id}] deliverMessage failed: ${result.error}`);
            }
          } catch (e) {
            console.error(`[node:${config.node.id}] deliverMessage error:`, e);
          }
        }
        await client.markMessageRead(message.id, agentId);
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
            to: BROADCAST_RECIPIENT,
            type: "done",
            payload: {
              taskId: task.id,
              summary: result.summary,
              output: result.output,
            },
            taskId: task.id,
          });

          console.log(`[node:${config.node.id}] completed task ${task.id}`);
        } catch (error) {
          console.error(`[node:${config.node.id}] task failed ${task.id}`, error);
          await client.sendMessage({
            id: randomUUID(),
            meshId: config.mesh.id,
            from: agentId,
            to: BROADCAST_RECIPIENT,
            type: "failed",
            payload: {
              taskId: task.id,
              error: String(error),
            },
            taskId: task.id,
          });
        }
      }
    }

    await Promise.all([
      sleep(config.node.pollIntervalMs),
      client.heartbeat(config.node.id, config.mesh.id).catch((e) => {
        console.error(`[node:${config.node.id}] heartbeat failed:`, e);
      }),
    ]);
  }
}
