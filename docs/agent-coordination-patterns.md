# 需求与 Agent 群组协作模式

> 自举任务产出：agent-research  
> 研究：需求与 agent 群组如何共同推进完成

## 一、问题

- **需求**：用户提出目标（如「实现用户认证」）
- **Agent 群组**：多个 agent 各自负责不同 repo/领域
- **如何协作**：需求如何拆解、分配、推进，agent 间如何协调？

## 二、协作模式

### 2.1 Lead 驱动（当前实现）

```
用户/Lead → 创建任务 → 指定 owner → Agent 执行 → 汇报 lead
```

- **优点**：简单、可控
- **局限**：Lead 需事先拆解，agent 间无直接协商

### 2.2 Agent 自协商

```
Lead 广播需求 → Agent 通过消息协商分工 → 各自领取/创建子任务 → 互发 question/answer
```

- **实现**：Lead 发 `broadcast`，payload 含需求描述；agents 用 `question`/`answer` 澄清，用 `request` 分配子任务
- **依赖**：`deliverMessage` 将消息注入 agent，agent 能理解并回复

### 2.3 任务池 + 自领

```
Lead 创建无 owner 任务 → 放入池 → Agent 竞争领取（claim）→ 执行后释放
```

- **需扩展**：`POST /tasks/:id/claim`，任务状态 `unclaimed`/`claimed`
- **适用**：可并行、无强依赖的 task

### 2.4 需求树

```
需求 = 根任务 → 子任务（blocks/blockedBy）→ Agent 按依赖执行
```

- **历史**：原设计有 DAG，已移除；若需可恢复为「可选字段」
- **权衡**：系统管理依赖 vs agent 自协商

## 三、推荐路径

| 阶段 | 模式 | 说明 |
|------|------|------|
| **MVP** | Lead 驱动 | 当前，已验证 |
| **Phase 2** | Agent 自协商 | 增强 `deliverMessage`，agent 能发 question/answer |
| **Phase 3** | 任务池 | 可选，用于可并行任务 |

## 四、实现要点

1. **消息驱动**：需求拆解、分工、澄清均通过消息（request/question/answer/done）
2. **taskId 关联**：消息带 taskId，`/tasks/:id/messages` 可追溯会话
3. **广播**：Lead 用 `to: "*"` 发需求，所有 agent 收到
4. **Chat 入口**：用户通过 `pnpm cli chat` 参与，发指令、看进展、干预

## 五、自举验证

本次自举已验证：

- 3 个 agent（tester、plugin、research）并行领取任务
- noop 适配器模拟完成，消息正确投递到 lead
- Chat 可查看 lead 收件箱、任务列表、按 task 查会话

下一步：将 noop 换为 acp/stdin，实现真实执行与 agent 间 question/answer。
