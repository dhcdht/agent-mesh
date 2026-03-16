# Adapter 协议规范

> 本文档定义 Agent Runner 与各 CLI Adapter 之间的接口契约，供 Phase 2 及后续实现参考。

## 一、目标

- 统一 Runner 调用 Adapter 的方式（入参、出参、超时）
- 明确 Adapter 如何将「完成/输出」回传给 Runner
- 定义失败、超时、部分完成时的处理方式
- 为 CLI 版本兼容预留扩展点

---

## 二、Runner–Adapter 接口契约

### 2.1 核心接口（TypeScript 风格，各语言需实现等价语义）

```typescript
interface Adapter {
  /** 适配器类型标识 */
  readonly cliType: string;

  /** 执行任务：将任务交给 CLI 并等待完成或超时 */
  executeTask(ctx: ExecuteContext): Promise<ExecuteResult>;

  /** 投递消息：将消息注入 CLI（如 inbox、stdin、API） */
  deliverMessage(ctx: MessageContext): Promise<DeliverResult>;

  /** 健康检查：CLI 是否可用 */
  healthCheck(): Promise<boolean>;
}

interface ExecuteContext {
  taskId: string;
  subject: string;
  description: string;
  repoPath: string;
  timeoutMs: number;        // 默认 30 分钟，可配置
  cliConfig: Record<string, unknown>;
}

interface ExecuteResult {
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  output?: string;         // CLI 输出摘要或关键信息
  error?: string;          // 失败原因
  partialOutput?: string;  // 超时/取消时的已产生输出
}

interface MessageContext {
  from: string;
  to: string;
  type: string;
  payload: unknown;
  repoPath: string;
  cliConfig: Record<string, unknown>;
}

interface DeliverResult {
  status: 'delivered' | 'failed';
  error?: string;
}
```

### 2.2 调用流程

```
Runner                          Adapter
  |                                |
  |-- executeTask(ctx) ---------->|
  |                                |-- 调用 CLI（API/stdin/文件）
  |                                |-- 等待完成或超时
  |<-- ExecuteResult --------------|
  |                                |
  |-- deliverMessage(ctx) -------->|
  |                                |-- 写入 inbox / 调用 API / stdin
  |<-- DeliverResult --------------|
```

### 2.3 超时与取消

| 场景 | 行为 | 返回值 |
|------|------|--------|
| 任务在 timeoutMs 内完成 | 正常返回 | `status: 'completed'` |
| 超过 timeoutMs | Adapter 尝试终止 CLI 进程/取消 API 请求 | `status: 'timeout'`, `partialOutput` 可选 |
| Runner 主动取消 | Adapter 收到取消信号，尽快终止 | `status: 'cancelled'` |
| CLI 崩溃/异常退出 | 捕获错误 | `status: 'failed'`, `error` 必填 |

### 2.4 完成回传机制

- **同步**：`executeTask` 为 Promise，Runner 通过 `await` 获取结果
- **无回调**：Runner 不向 Adapter 注册回调；Adapter 通过 Promise resolve/reject 返回
- **流式输出**（可选扩展）：若 Adapter 支持，可增加 `onChunk?: (chunk: string) => void` 用于增量输出，Phase 2 可不实现

---

## 三、错误处理

### 3.1 Adapter 内部错误

| 错误类型 | 处理 | Runner 行为 |
|----------|------|-------------|
| CLI 未安装/不可用 | `healthCheck()` 返回 false | Runner 不分配任务，标记 agent offline |
| 网络/API 错误 | `executeTask` 返回 `status: 'failed'` | Runner 上报 Coordinator，可重试（见 Coordinator 设计） |
| 超时 | 返回 `status: 'timeout'` | Runner 上报，任务可重新分配或标记失败 |
| 权限/路径错误 | 返回 `status: 'failed'` | Runner 上报，不重试 |

### 3.2 重试策略（Runner 侧）

- `executeTask` 失败时，Runner **不**自动重试；由 Coordinator 决定是否重新分配
- `deliverMessage` 失败时，Runner 可重试 1–2 次（短暂延迟），仍失败则上报

---

## 四、CLI 版本兼容

### 4.1 版本声明

Adapter 应在 `cliConfig` 或元数据中声明支持的 CLI 版本范围，例如：

```json
{
  "cliType": "opencode",
  "supportedVersions": ">=1.0.0 <2.0.0",
  "cliConfig": { ... }
}
```

### 4.2 兼容策略

- **小版本升级**：Adapter 应尽量向后兼容，避免因 patch 版本变更而失效
- **大版本升级**：若 CLI 破坏性变更，需新增 Adapter 或版本分支（如 `opencode-v2`）
- **检测**：`healthCheck()` 可可选地检测 CLI 版本，不匹配时返回 false 并记录日志

---

## 五、各 Adapter 实现要点

### 5.1 OpenCode Adapter（P0）

- 通过 `opencode serve` HTTP API 或 SDK 创建 session、发送 prompt
- `executeTask`：调用 `POST /sessions` 或等价 API，轮询直到完成或超时
- `deliverMessage`：通过 session 的 message API 注入
- `healthCheck`：`GET /health` 或等价

### 5.2 Claude Code Adapter（P1）

- 依赖文件系统：写入 `~/.claude/teams/{meshId}/inboxes/{agentId}.json`
- `executeTask`：通过 Task 工具或等价机制；需与 Claude Code 同机或共享/同步文件
- `deliverMessage`：追加到 inbox JSON 文件
- `healthCheck`：检查 inbox 路径可写、Claude Code 进程存在（可选）

### 5.3 通用 stdin Adapter（P2）

- 适用于支持 `cli "prompt"` 的 CLI
- `executeTask`：spawn 子进程，写入 subject+description 到 stdin，解析 stdout
- `deliverMessage`：若 CLI 支持从 stdin 读消息，则写入；否则可能不支持，返回 `status: 'failed'`
- `healthCheck`：`which <cli>` 检查可执行文件存在

---

## 六、附录：Runner 伪代码

```typescript
async function runTask(agentId: string, task: Task): Promise<void> {
  const adapter = getAdapter(agentId);
  if (!(await adapter.healthCheck())) {
    markAgentOffline(agentId);
    return;
  }
  const result = await adapter.executeTask({
    taskId: task.id,
    subject: task.subject,
    description: task.description,
    repoPath: getRepoPath(task.repoId),
    timeoutMs: 30 * 60 * 1000,
    cliConfig: getAgentConfig(agentId).cliConfig,
  });
  await coordinator.reportTaskResult(task.id, result);
  if (result.status === 'completed') {
    await coordinator.updateTaskStatus(task.id, 'completed');
  } else {
    // 由 Coordinator 决定重试或标记失败
    await coordinator.reportTaskFailure(task.id, result);
  }
}
```
