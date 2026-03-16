import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCodeAdapter } from "./claude-code.js";

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("ClaudeCodeAdapter", () => {
  it("writes task to inbox file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "claude-code-test-"));
    cleanupDirs.push(dir);

    const adapter = new ClaudeCodeAdapter("agent-a", {
      teamName: "test-team",
      baseDir: dir,
    });

    const result = await adapter.execute({
      id: "task-1",
      meshId: "mesh-1",
      subject: "Test subject",
      description: "Test description",
      status: "pending",
      owner: "agent-a",
      repoId: "repo-a",
      blocks: [],
      blockedBy: [],
      createdAt: "",
      updatedAt: "",
    });

    expect(result.summary).toContain("Task task-1");
    expect(result.summary).toContain("inbox");

    const inboxPath = join(dir, "teams", "test-team", "inboxes", "agent-a.json");
    const raw = readFileSync(inboxPath, "utf-8");
    const entries = JSON.parse(raw) as unknown[];
    expect(entries).toHaveLength(1);
    const envelope = entries[0] as { from: string; text: string };
    expect(envelope.from).toBe("agent-mesh-node");
    const payload = JSON.parse(envelope.text) as { type: string; taskId: string };
    expect(payload.type).toBe("task_assignment");
    expect(payload.taskId).toBe("task-1");
  });
});
