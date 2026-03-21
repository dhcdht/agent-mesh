import { randomUUID } from "node:crypto";
import { BROADCAST_RECIPIENT } from "@agent-mesh/shared";
import type { NodeConfig } from "./types.js";
import { createAdapter } from "./adapters/factory.js";
import { CoordinatorClient } from "./client.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ExecutionLock {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }
}

const globalLock = new ExecutionLock();

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

  const runAgentLoop = async (repo: (typeof config.repos)[0]) => {
    const agentId = repo.agent.id;
    const adapter = adapters.get(agentId)!;
    const isStdinArgsOnly =
      repo.agent.cliType === "stdin" && (repo.agent.cliConfig as { argsOnly?: boolean })?.argsOnly === true;
    
    const allAgentIds = config.repos.map(r => r.agent.id).join(", ");

    while (true) {
      try {
        const [inbox, allTasks] = await Promise.all([
          client.listInbox(config.mesh.id, agentId, true),
          client.listPendingTasks(config.mesh.id, ""), 
        ]);

        const unownedTasks = (allTasks as any[]).filter(t => !t.owner || t.owner === "");
        for (const task of unownedTasks) {
          try {
            console.log(`[node:${config.node.id}] [agent:${agentId}] claiming task ${task.id}`);
            await client.claimTask(task.id, agentId);
          } catch {
          }
        }

        const taskSnapshot = (allTasks as any[])
          .map(t => `- [${t.status}] ${t.id}: ${t.subject} (owner: ${t.owner})`)
          .join("\n");

        for (const message of inbox) {
          if (message.from === agentId || message.from === "system") {
            await client.markMessageRead(message.id, agentId);
            continue;
          }

          console.log(
            `[node:${config.node.id}] [agent:${agentId}] inbox <- ${message.from} (${message.type})`
          );

          const payload = message.payload as Record<string, unknown>;
          const text = (payload?.text ?? payload?.summary ?? JSON.stringify(payload)) as string;
          
          // STRICT REPLY POLICY:
          // 1. Always reply to User
          // 2. Reply to other Agents ONLY if it is a specific "question" directed at us.
          // 3. IGNORE "message" or "broadcast" from other agents to prevent loops.
          const isFromUser = message.from === "user" || message.from === "lead";
          const isDirectQuestion = message.type === "question" && message.to === agentId;
          
          const shouldReply = text && !isStdinArgsOnly && (isFromUser || isDirectQuestion);

          if (shouldReply) {
            console.log(`[node:${config.node.id}] [agent:${agentId}] replying to ${message.from}`);
            const syntheticTask = {
              id: `msg-${message.id}`,
              meshId: config.mesh.id,
              subject: `Reply to ${message.from}`,
              description: `[TEAM CONTEXT]\nMembers: ${allAgentIds}\n\n[MESH STATUS]\n${taskSnapshot}\n\n[MESSAGE]\n${text}`,
              status: "pending" as const,
              owner: agentId,
              repoId: repo.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            try {
              await globalLock.acquire();
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
              await client.sendMessage({
                id: randomUUID(),
                meshId: config.mesh.id,
                from: agentId,
                to: BROADCAST_RECIPIENT,
                type: "message",
                payload: { error: String(e) },
                taskId: message.taskId,
              });
            } finally {
              globalLock.release();
            }
          } else if (adapter.deliverMessage) {
            await adapter.deliverMessage({
              id: message.id,
              from: message.from,
              to: message.to,
              type: message.type,
              payload: message.payload,
              taskId: message.taskId,
            });
          }
          await client.markMessageRead(message.id, agentId);
        }

        const tasks = await client.listPendingTasks(config.mesh.id, agentId);
        for (const task of tasks) {
          try {
            await client.markTaskStatus(task.id, "in_progress");
            await globalLock.acquire();
            const result = await adapter.execute(task);
            await client.markTaskStatus(task.id, "completed");
            await client.sendMessage({
              id: randomUUID(),
              meshId: config.mesh.id,
              from: agentId,
              to: BROADCAST_RECIPIENT,
              type: "done",
              payload: { taskId: task.id, summary: result.summary, output: result.output },
              taskId: task.id,
            });
          } catch (error) {
            console.error(`[node:${config.node.id}] [agent:${agentId}] task failed ${task.id}`, error);
            await client.sendMessage({
              id: randomUUID(),
              meshId: config.mesh.id,
              from: agentId,
              to: BROADCAST_RECIPIENT,
              type: "failed",
              payload: { taskId: task.id, error: String(error) },
              taskId: task.id,
            });
          } finally {
            globalLock.release();
          }
        }
      } catch (e) {
        console.error(`[node:${config.node.id}] [agent:${agentId}] loop error:`, e);
      }

      await Promise.all([
        sleep(config.node.pollIntervalMs),
        client.heartbeat(config.node.id, config.mesh.id).catch(() => {}),
      ]);
    }
  };

  await Promise.all(config.repos.map(runAgentLoop));
}
