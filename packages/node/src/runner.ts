import { randomUUID } from "node:crypto";
import { BROADCAST_RECIPIENT } from "@agent-mesh/shared";
import type { NodeConfig } from "./types.js";
import { createAdapter } from "./adapters/factory.js";
import { CoordinatorClient } from "./client.js";
import path from "node:path";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ExecutionLock {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(agentId: string): Promise<void> {
    console.log(`[LOCK] agent:${agentId} requesting lock (currently ${this.locked ? 'LOCKED' : 'FREE'})`);
    if (!this.locked) {
      this.locked = true;
      console.log(`[LOCK] agent:${agentId} acquired lock immediately.`);
      return;
    }
    return new Promise((resolve) => {
      console.log(`[LOCK] agent:${agentId} added to queue.`);
      this.queue.push(resolve);
    });
  }

  release(agentId: string): void {
    console.log(`[LOCK] agent:${agentId} releasing lock.`);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      console.log(`[LOCK] transferring lock to next agent in queue.`);
      next?.();
    } else {
      this.locked = false;
      console.log(`[LOCK] lock is now FREE.`);
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

    const binPath = path.join(process.cwd(), "bin");
    const cliConfig = {
      ...(repo.agent.cliConfig as Record<string, unknown>),
      env: {
        ...(process.env),
        PATH: `${binPath}:${process.env.PATH}`,
        MESH_ID: config.mesh.id,
        MESH_COORDINATOR_URL: config.coordinator.url
      }
    };

    adapters.set(repo.agent.id, createAdapter(repo.agent.cliType, repo.agent.id, cliConfig, repo.path));
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
            await client.claimTask(task.id, agentId);
          } catch {}
        }

        const taskSnapshot = (allTasks as any[])
          .map(t => `- [${t.status}] ${t.id}: ${t.subject} (owner: ${t.owner})`)
          .join("\n");

        for (const message of inbox) {
          if (message.from === agentId || message.from === "system") {
            await client.markMessageRead(message.id, agentId);
            continue;
          }

          const payload = message.payload as Record<string, unknown>;
          const text = (payload?.text ?? payload?.summary ?? JSON.stringify(payload)) as string;
          
          const isFromUser = message.from === "user" || message.from === "lead";
          const isDirectQuestion = message.type === "question" && message.to === agentId;
          const shouldReply = false && text && !isStdinArgsOnly && (isFromUser || isDirectQuestion);

          if (shouldReply) {
            console.log(`[node] agent:${agentId} replying...`);
            try {
              await globalLock.acquire(agentId);
              const syntheticTask = {
                id: `msg-${message.id}`,
                meshId: config.mesh.id,
                subject: `Reply to ${message.from}`,
                description: `[RULES]\n1. ONLY reply if you have CODE or a PLAN.\n2. NO "OK" messages.\n3. You have 'mesh-tool' in PATH to create tasks.\n\n[CONTEXT]\nMembers: ${allAgentIds}\n\n[MESSAGE]\n${text}`,
                status: "pending" as const,
                owner: agentId,
                repoId: repo.id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              const result = await adapter.execute(syntheticTask);
              await client.sendMessage({
                id: randomUUID(),
                meshId: config.mesh.id,
                from: agentId,
                to: BROADCAST_RECIPIENT,
                type: "message",
                payload: { text: result.summary },
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
              globalLock.release(agentId);
            }
          }
          await client.markMessageRead(message.id, agentId);
        }

        const tasks = await client.listPendingTasks(config.mesh.id, agentId);
        for (const task of tasks) {
          try {
            await client.markTaskStatus(task.id, "in_progress");
            await globalLock.acquire(agentId);
            const result = await adapter.execute(task);
            await client.markTaskStatus(task.id, "completed");
            await client.sendMessage({
              id: randomUUID(),
              meshId: config.mesh.id,
              from: agentId,
              to: BROADCAST_RECIPIENT,
              type: "done",
              payload: { taskId: task.id, summary: result.summary },
              taskId: task.id,
            });
          } catch (error) {
            console.error(`[node:${config.node.id}] [agent:${agentId}] task failed ${task.id}`, error);
            await client.markTaskStatus(task.id, "deleted");
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
            globalLock.release(agentId);
          }
        }

      } catch (e) {}
      await sleep(config.node.pollIntervalMs);
    }
  };

  setInterval(() => {
    client.heartbeat(config.node.id, config.mesh.id).catch(() => {});
  }, 10000);

  await Promise.all(config.repos.map(runAgentLoop));
}
