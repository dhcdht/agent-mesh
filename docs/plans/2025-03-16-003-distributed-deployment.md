# 分布式部署方案

> 本文档定义 Coordinator 多实例、存储分工、会话亲和性、WebSocket 路由等分布式部署策略。

## 一、目标

- Coordinator 支持多实例水平扩展
- 任务/邮箱/注册表在多实例间一致
- WebSocket/SSE 连接与多实例正确路由
- Agent Node 可跨机器部署，无状态或最小状态

---

## 二、存储分工

### 2.1 数据分类

| 数据类型 | 存储 | 说明 |
|----------|------|------|
| Mesh、Task、Message、Agent、Repo | PostgreSQL | 持久化，多实例共享 |
| Node 注册、心跳 | PostgreSQL 或 Redis | 短期状态，Redis 更适合作缓存 |
| 任务锁、claim 互斥 | Redis（分布式锁） | 防止多实例同时分配同一任务 |
| WebSocket 会话 | 内存 + Redis Pub/Sub | 见 2.3 |

### 2.2 多实例下的数据库

- 所有 Coordinator 实例连接**同一 PostgreSQL**
- 使用事务 + 乐观锁（如 `version` 字段）处理并发更新
- 任务 claim：`UPDATE tasks SET owner=?, version=version+1 WHERE id=? AND version=?`，影响行数为 0 则 claim 失败

### 2.3 Redis 角色

| 用途 | 实现 |
|------|------|
| 分布式锁 | `SET key val NX EX 30` 实现任务 claim 互斥 |
| 会话亲和 | 见 2.4 |
| 消息队列（可选） | 任务分配、消息投递的异步处理，Phase 4 可选 |

---

## 三、会话亲和性（Session Affinity）

### 3.1 问题

- 用户/Node 通过 WebSocket 连接 Coordinator
- 若请求经负载均衡分散到不同实例，同一客户端的 HTTP 与 WebSocket 可能落在不同实例
- 需要：同一 Node/用户的 WebSocket 始终连到同一实例，或跨实例消息可路由

### 3.2 方案 A：Sticky Session（推荐 Phase 4 初期）

- 负载均衡（如 Nginx、云 LB）按 `X-Node-Id` 或 `Authorization` 做一致性哈希
- 同一 Node 的请求总落到同一实例
- 简单，但实例扩缩容时需 rehash，部分连接会断开重连

### 3.3 方案 B：Redis Pub/Sub 跨实例消息

- 各实例将「需推送给某 Node 的消息」发布到 Redis Channel：`node:{nodeId}`
- 所有实例订阅该 Channel，但只有「该 Node 的 WebSocket 连在本实例」的实例才真正推送
- 实现：实例启动时注册 `nodeId -> instanceId` 到 Redis；发布时查表，只有对应实例消费并推送

```
Node A --WS--> Instance 1
Instance 1 订阅 Redis channel "node:A"
某处发布消息到 "node:A"
Instance 1 收到，推送给 Node A
```

### 3.4 方案 C：单实例 WebSocket 网关

- 单独部署一个 WebSocket 网关，所有 WS 连接集中于此
- 网关与 Coordinator 实例通过 Redis 或内部 RPC 通信
- 适合 WS 连接量大的场景，Phase 4 可选

**Phase 4 建议**：先采用方案 A，验证后再考虑 B 或 C。

---

## 四、WebSocket 与多实例路由

### 4.1 连接建立

1. Node 向任意 Coordinator 实例发起 `GET /ws?nodeId=xxx`（或通过 LB）
2. 若使用 Sticky Session，LB 将同一 nodeId 的请求路由到同一实例
3. 实例校验 nodeToken，建立 WebSocket 连接，记录 `nodeId -> connection` 本地映射

### 4.2 消息推送

- 任务分配、新消息等事件需要推送给 Node
- 若事件产生于另一实例：通过 Redis Pub/Sub 发布 `node:{nodeId}`，持有该 Node 连接的实例消费并推送
- 若事件产生于本实例：直接查本地映射推送

### 4.3 连接断开

- Node 断开后，实例从本地映射移除，并清除 Redis 中的 `nodeId -> instanceId` 注册
- Node 重连时可能落到不同实例，需重新注册

---

## 五、Agent Node 部署

### 5.1 无状态

- Node 不持久化任务状态，每次从 Coordinator 拉取
- 重启后重新注册，拉取未完成的任务继续执行

### 5.2 多 Node 与 Agent 分布

- 一台机器可运行多个 Node 进程（不同 mesh、不同 agent）
- 或一个 Node 进程管理多个 Agent（同机多 repo）
- 通过 `nodeId` + `agentIds` 注册，Coordinator 只将任务分给已注册的 agent

### 5.3 弹性扩容

- 新需求 → 创建新 mesh → 启动新 Node（或复用已有 Node 注册新 agent）
- 需求完成 → mesh 状态 `completed` → Node 停止拉取该 mesh 的任务，可回收资源
- 容器化：每个 mesh 一组容器，或 Node 支持多 mesh，通过配置区分

---

## 六、一致性策略总结

| 场景 | 策略 |
|------|------|
| 任务 claim | Redis 分布式锁 或 DB 乐观锁 |
| 任务/消息 CRUD | PostgreSQL 事务 |
| 多实例读 | 直接读 DB，无强一致缓存时可接受短暂延迟 |
| WebSocket 路由 | Sticky Session 或 Redis Pub/Sub |
| Node 心跳 | Redis 存储，TTL 过期视为离线 |

---

## 七、Phase 4 实施顺序

1. **PostgreSQL 迁移**：从 SQLite 迁移到 PostgreSQL，Schema 保持一致
2. **多实例部署**：同一 DB，多 Coordinator 进程，前接 LB
3. **Sticky Session**：配置 LB 按 nodeId 或 token 做亲和
4. **Redis 引入**：分布式锁、可选 Pub/Sub
5. **Node 跨机器**：确保 Node 可连到 Coordinator（网络、防火墙）
