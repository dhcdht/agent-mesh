export function hasCycle(
  tasks: { id: string; blockedBy: string[] }[]
): boolean {
  const graph = new Map<string, string[]>();
  for (const t of tasks) {
    graph.set(t.id, t.blockedBy || []);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(node: string): boolean {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const dep of graph.get(node) || []) {
      if (dfs(dep)) return true;
    }
    stack.delete(node);
    return false;
  }

  for (const t of tasks) {
    if (!visited.has(t.id) && dfs(t.id)) return true;
  }
  return false;
}
