# Coordinator API 详细设计

> 本文档定义 Coordinator 的 API、任务分配规则、错误处理策略、认证模型，供 Phase 1 实现参考。

## 一、API 概览

### 1.1 基础信息

- **协议**：REST over HTTP/HTTPS
- **数据格式**：JSON
- **认证**：API Key（Header: `X-API-Key`）或 JWT（Header: `Authorization: Bearer <token>`）
- **Base URL**：`/api/v1`

### 1.2 主要资源

| 资源 | 路径 | 说明 |
|------|------|------|
| Mesh | `/meshes` | Mesh 生命周期 |
| Task | `/meshes/:meshId/tasks` | 任务 CRUD |
| Message | `/meshes/:meshId/messages` | 消息收发 |
| Agent | `/meshes/:meshId/agents` | Agent 注册 |
| Repo | `/meshes/:meshId/repos` | Repo 配置 |
| Node | `/nodes` | Agent Node 注册（内部/管理用） |

---

## 二、任务分配与归属规则

### 2.1 分配策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **按 repoId 分配** | 任务创建时指定 `repoId`，自动归属该 repo 的 agent | 默认，Phase 1 实现 |
| **显式指定 owner** | Lead/用户创建任务时指定 `owner`（agentId） | 需要指定特定 agent 时 |
| **自领（self-claim）** | Agent 从待领任务池中领取，先到先得 | Phase 2+，需任务池与锁 |

**Phase 1 规则**：

1. 创建任务时必须提供 `repoId` 或 `owner` 之一
2. 若仅提供 `repoId`，则 `owner` = 该 repo 的 `agentId`（1:1 约束）
3. 若提供 `owner`，则 `repoId` = 该 agent 的 `repoId`
4. 任务创建时校验 `blockedBy` 中所有任务已存在且非 deleted

### 2.2 多 Agent 竞争

- **Phase 1**：每 repo 单 Agent，无竞争
- **Phase 2+**：若支持多 Agent 共享 repo，采用**乐观锁**：任务有 `version` 字段，claim 时 CAS 更新，失败则重试或放弃

### 2.3 Lead/用户指定归属

- `POST /meshes/:meshId/tasks` 请求体支持 `owner` 字段
- 若 `owner` 与 `repoId` 不一致（未来扩展），以 `owner` 为准，需校验 `owner` 属于该 mesh

---

## 三、任务 CRUD 与 DAG 校验

### 3.1 创建任务

```
POST /meshes/:meshId/tasks
Body: { subject, description, repoId?, owner?, blockedBy? }
```

- 校验 `blockedBy` 中任务存在且非 deleted
- 校验 `blockedBy` 不形成循环（见 3.3）
- 自动设置 `status: pending`

### 3.2 更新任务

```
PATCH /meshes/:meshId/tasks/:taskId
Body: { status?, blocks?, blockedBy?, ... }
```

- 若更新 `blocks`/`blockedBy`，需重新做 DAG 校验
- `status` 流转：`pending` → `in_progress` → `completed` | `deleted`

### 3.3 循环依赖检测（DAG 校验）

- 以任务为节点，`blockedBy` 为有向边，构建图
- 使用 DFS 或拓扑排序检测环：若存在环则拒绝创建/更新
- 算法：对每个节点做 DFS，若访问到已在栈中的节点则为环

```python
def has_cycle(tasks: List[Task]) -> bool:
    graph = {t.id: t.blockedBy for t in tasks}
    visited, stack = set(), set()
    def dfs(node):
        if node in stack: return True
        if node in visited: return False
        visited.add(node)
        stack.add(node)
        for dep in graph.get(node, []):
            if dfs(dep): return True
        stack.remove(node)
        return False
    return any(dfs(t.id) for t in tasks if t.id not in visited)
```

---

## 四、错误处理与恢复策略

### 4.1 错误分类

| 类型 | 示例 | 处理 |
|------|------|------|
| **Agent 崩溃** | Node 进程退出、CLI 异常 | Node 重启后重新注册；未完成任务保持 `in_progress`，超时后可重新分配 |
| **网络中断** | Node 与 Coordinator 断连 | Node 重连后恢复轮询；消息可重试投递 |
| **任务执行失败** | Adapter 返回 `status: 'failed'` | 任务保持 `in_progress` 或标记为 `failed`（新增状态可选）；可人工或 Lead 重新分配 |
| **消息投递失败** | Adapter deliverMessage 失败 | 重试 1–2 次；仍失败则写入死信，记录日志 |

### 4.2 重试策略

| 场景 | 重试次数 | 退避 | 上限 |
|------|----------|------|------|
| 任务执行失败 | 由 Lead/用户决定是否重新分配 | - | - |
| 消息投递 | 2 次 | 1s, 3s | - |
| Node 注册/心跳 | 指数退避 | 1s, 2s, 4s... | 5min |

### 4.3 死信处理

- 投递失败的消息写入 `dead_letter` 表或标记 `delivery_status: failed`
- 保留原始消息、失败原因、时间戳
- 可通过管理 API 或 Web UI 查看、重试或丢弃

### 4.4 任务超时

- 任务有 `claimedAt` 字段，若 `status=in_progress` 且超过阈值（如 2 小时）无更新，可自动释放回 `pending` 供其他 Agent 领取
- Phase 1 可简化：不自动释放，由人工处理

---

## 五、认证与权限

### 5.1 API 认证

- **API Key**：用于 CLI、Web、插件调用 Coordinator
- **JWT**：用于 Web 登录、插件 OAuth 等，可选 Phase 2+

### 5.2 Node 认证

- 每个 Node 注册时携带 `nodeSecret`（预配置，与 Coordinator 共享）
- Coordinator 校验 `nodeSecret`，通过后颁发短期 `nodeToken`（如 1 小时有效）
- Node 后续请求携带 `nodeToken`
- Node 只能拉取/更新**自己负责的 agent** 的任务和邮箱

### 5.3 权限隔离

| 角色 | 权限 |
|------|------|
| API Key（用户） | 创建 mesh、任务、消息；查看全部 |
| Node | 仅读写自己 nodeId 下 agent 的任务、邮箱；更新 agent 状态 |
| 未认证 | 拒绝 |

---

## 六、消息持久化与归档

### 6.1 保留策略

- **Phase 1**：消息永久保留，无自动归档
- **Phase 2+**：可配置 `messageRetentionDays`，超过则归档到冷存储或删除

### 6.2 归档策略（可选）

- 按 `meshId` + `createdAt` 归档
- 归档表结构与主表相同，查询时可选是否包含归档

---

## 七、API 端点清单（Phase 1）

### Mesh

- `POST /meshes` — 创建 mesh
- `GET /meshes/:meshId` — 获取 mesh
- `PATCH /meshes/:meshId` — 更新 mesh（如 status）
- `DELETE /meshes/:meshId` — 回收 mesh

### Task

- `POST /meshes/:meshId/tasks` — 创建任务（含 DAG 校验）
- `GET /meshes/:meshId/tasks` — 列表（支持 filter: status, owner, repoId）
- `GET /meshes/:meshId/tasks/:taskId` — 详情
- `PATCH /meshes/:meshId/tasks/:taskId` — 更新（含 DAG 校验）
- `POST /meshes/:meshId/tasks/:taskId/claim` — 领取任务（Phase 2，可选）

### Message

- `POST /meshes/:meshId/messages` — 发送消息
- `GET /meshes/:meshId/agents/:agentId/inbox` — 获取 agent 收件箱（Node 用）
- `PATCH /meshes/:meshId/messages/:msgId/read` — 标记已读

### Agent

- `POST /meshes/:meshId/agents` — 注册 agent（Node 用）
- `GET /meshes/:meshId/agents` — 列表
- `PATCH /meshes/:meshId/agents/:agentId` — 更新状态（Node 用）

### Repo

- `POST /meshes/:meshId/repos` — 添加 repo
- `GET /meshes/:meshId/repos` — 列表

### Node（内部）

- `POST /nodes/register` — Node 注册，返回 nodeToken
- `POST /nodes/heartbeat` — 心跳
