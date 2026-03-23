import { z } from "zod";
import type { CoordinatorStorage } from "../types.js";

export function registerMeshTools(server: any, storage: CoordinatorStorage) {
  server.tool(
    "list_tasks",
    "List all tasks in a specific mesh",
    {
      meshId: z.string().describe("The ID of the mesh to filter tasks by"),
      status: z.string().optional().describe("Filter by task status (pending, in_progress, completed)"),
      owner: z.string().optional().describe("Filter by task owner (agent ID)")
    },
    async ({ meshId, status, owner }: { meshId: string; status?: string; owner?: string }) => {
      const tasks = await storage.listTasks({ meshId, status, owner });
      return {
        content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }]
      };
    }
  );

  server.tool(
    "create_task",
    "Create a new task in the mesh",
    {
      id: z.string().describe("Unique task ID"),
      meshId: z.string().describe("Target mesh ID"),
      subject: z.string().describe("Short summary of the task"),
      description: z.string().describe("Detailed instructions"),
      owner: z.string().describe("Agent ID assigned to this task"),
      repoId: z.string().describe("Repository ID this task belongs to"),
      parentId: z.string().optional().describe("Optional parent task ID for recursive splitting")
    },
    async (params: any) => {
      const task = await storage.createTask(params);
      return {
        content: [{ type: "text", text: `Task created: ${task.id}` }]
      };
    }
  );

  server.tool(
    "send_message",
    "Send a message to an agent or broadcast to all",
    {
      meshId: z.string(),
      from: z.string(),
      to: z.string().describe("Agent ID or '*' for broadcast"),
      type: z.enum(["message", "broadcast", "question", "answer"]),
      text: z.string(),
      taskId: z.string().optional()
    },
    async ({ meshId, from, to, type, text, taskId }: any) => {
      const msg = await storage.createMessage({
        id: `mcp-${Date.now()}`,
        meshId,
        from,
        to,
        type,
        payload: { text },
        taskId
      });
      return {
        content: [{ type: "text", text: `Message sent: ${msg.id}` }]
      };
    }
  );
}
