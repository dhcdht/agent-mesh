import { Task } from "@agent-mesh/shared";
import { AgentAdapter, AdapterExecutionResult, MessageContext, DeliverResult } from "./types.js";
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { execa } from "execa";

export class PiAgentAdapter implements AgentAdapter {
  private pendingMessages: MessageContext[] = [];

  constructor(private readonly agentId: string, private readonly config: Record<string, any>) {}

  async deliverMessage(ctx: MessageContext): Promise<DeliverResult> {
    this.pendingMessages.push(ctx);
    return { status: "delivered" };
  }

  async execute(task: Task): Promise<AdapterExecutionResult> {
    console.log(`[PiAgentAdapter] Starting autonomous session for ${this.agentId}...`);
    
    // Convert mesh config to PiAgent options
    const cwd = typeof this.config.cwd === 'string' ? this.config.cwd : process.cwd();
    
    // Wave 2: Skill & Tool Bridge
    // Register mesh tools as custom tools in Pi SDK
    const meshToolDef: any = {
      name: "mesh-tool",
      label: "Mesh Tool",
      description: "Execute Agent Mesh CLI commands like creating tasks or sending messages",
      parameters: {
        type: "object",
        properties: {
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments, e.g. ['task:create', '--id', '...']"
          }
        },
        required: ["args"]
      },
      execute: async (params: any, { signal }: { signal?: AbortSignal } = {}) => {
        try {
          const env = {
            ...process.env,
            MESH_ID: this.config.env?.MESH_ID || "default",
            MESH_COORDINATOR_URL: this.config.env?.MESH_COORDINATOR_URL || "http://localhost:3000",
          };
          
          const result = await execa("mesh-tool", params.args as string[], { 
            env, 
            cwd: cwd,
            reject: false,
            signal
          });
          
          if (result.exitCode !== 0) {
            return {
              content: [{ type: "text", text: `Command failed with exit code ${result.exitCode}:\n${result.stderr || result.stdout}` }],
              isError: true
            };
          }
          
          return {
            content: [{ type: "text", text: result.stdout || "Command executed successfully" }],
            isError: false
          };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Failed to execute mesh-tool: ${e}` }],
            isError: true
          };
        }
      }
    };

    const meshEditDef: any = {
      name: "mesh-edit",
      label: "Mesh Edit",
      description: "Execute file operations like read, write, edit",
      parameters: {
        type: "object",
        properties: {
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments, e.g. ['read', 'path=...']"
          }
        },
        required: ["args"]
      },
      execute: async (params: any, { signal }: { signal?: AbortSignal } = {}) => {
        try {
           const result = await execa("mesh-edit", params.args as string[], {
             cwd: cwd,
             reject: false,
             signal
           });

           if (result.exitCode !== 0) {
             return {
               content: [{ type: "text", text: `Command failed with exit code ${result.exitCode}:\n${result.stderr || result.stdout}` }],
               isError: true
             };
           }

           return {
             content: [{ type: "text", text: result.stdout || "Command executed successfully" }],
             isError: false
           };
        } catch (e) {
           return {
             content: [{ type: "text", text: `Failed to execute mesh-edit: ${e}` }],
             isError: true
           };
        }
      }
    };

    try {
      const { session } = await createAgentSession({
        cwd,
        customTools: [meshToolDef, meshEditDef],
        model: this.config.model // Allow config to override model
      });

      const unsubscribe = session.subscribe((event: any) => {
        switch (event.type) {
          case 'message_start':
            if (event.message.role === 'assistant') {
              console.log(`[PiAgentAdapter] Agent ${this.agentId} thinking...`);
            }
            break;
          case 'tool_execution_start':
            console.log(`[PiAgentAdapter] Agent ${this.agentId} calling tool: ${event.toolName}`);
            break;
          case 'tool_execution_end':
            console.log(`[PiAgentAdapter] Agent ${this.agentId} tool result (${event.toolName}): ${event.isError ? 'Error' : 'Success'}`);
            break;
          case 'error':
            console.error(`[PiAgentAdapter] Agent ${this.agentId} error:`, event.error);
            break;
        }
      });

      const systemPrompt = `
You are an autonomous agent named '${this.agentId}'.
Your mission is to develop the 'Agent Mesh' project.

TOOLS AVAILABLE:
- mesh-tool: Use to interact with the mesh network (create tasks, send messages, etc)
- mesh-edit: Use for ALL file operations (read, write, edit, git)

RULES:
1. NO interactive prompts. Use non-interactive tools only.
2. Be concise and move straight to execution.
3. Use mesh-edit for file modifications.
`;

      const promptText = `
System Context: ${systemPrompt}

Task Subject: ${task.subject}
Task Description: ${task.description}

Please execute this task now.
`;

      await session.prompt(promptText);

      const messages = session.state.messages;
      const lastMsg = messages[messages.length - 1];
      const resultText = lastMsg && lastMsg.role === 'assistant' 
        ? lastMsg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
        : `PiAgent SDK completed task ${task.id}`;

      unsubscribe();
      session.dispose();

      return {
        summary: resultText,
        output: { stdout: resultText, stderr: "", exitCode: 0 }
      };
    } catch (e) {
      throw new Error(`Pi SDK Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.pendingMessages = [];
    }
  }
}
