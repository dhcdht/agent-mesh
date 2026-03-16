import { describe, it, expect } from "vitest";
import { hasCycle } from "./dag.js";

describe("hasCycle", () => {
  it("returns false for empty tasks", () => {
    expect(hasCycle([])).toBe(false);
  });

  it("returns false for single task with no deps", () => {
    expect(hasCycle([{ id: "a", blockedBy: [] }])).toBe(false);
  });

  it("returns false for linear chain", () => {
    expect(
      hasCycle([
        { id: "a", blockedBy: [] },
        { id: "b", blockedBy: ["a"] },
        { id: "c", blockedBy: ["b"] },
      ])
    ).toBe(false);
  });

  it("returns true for direct cycle", () => {
    expect(
      hasCycle([
        { id: "a", blockedBy: ["b"] },
        { id: "b", blockedBy: ["a"] },
      ])
    ).toBe(true);
  });

  it("returns true for indirect cycle", () => {
    expect(
      hasCycle([
        { id: "a", blockedBy: ["c"] },
        { id: "b", blockedBy: ["a"] },
        { id: "c", blockedBy: ["b"] },
      ])
    ).toBe(true);
  });
});
