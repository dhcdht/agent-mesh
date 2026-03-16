# Phase 1 CLI 使用说明

CLI 包：@agent-mesh/cli

## 构建

```bash
pnpm --filter @agent-mesh/cli build
```

## 查看帮助

```bash
pnpm --filter @agent-mesh/cli start --help
```

## 全局参数

- `-c, --coordinator <url>`：Coordinator 地址，默认 `http://localhost:3000`
- `--api-key <key>`：可选 API Key

## 命令

### 1) 创建 Mesh

```bash
pnpm --filter @agent-mesh/cli start -- mesh:create --id mesh-1 --name "Mesh One"
```

### 2) 列出 Mesh

```bash
pnpm --filter @agent-mesh/cli start -- mesh:list
```

### 3) 添加 Repo

```bash
pnpm --filter @agent-mesh/cli start -- repo:add \
  --id repo-frontend \
  --mesh-id mesh-1 \
  --path /path/to/frontend \
  --agent-id agent-frontend
```

### 4) 创建任务

```bash
pnpm --filter @agent-mesh/cli start -- task:create \
  --id task-1 \
  --mesh-id mesh-1 \
  --subject "Implement auth" \
  --description "Create auth endpoints" \
  --owner agent-frontend \
  --repo-id repo-frontend
```

### 5) 查询任务

```bash
pnpm --filter @agent-mesh/cli start -- task:list --mesh-id mesh-1 --owner agent-frontend
```

### 6) 查询收件箱

```bash
pnpm --filter @agent-mesh/cli start -- inbox:list --mesh-id mesh-1 --agent-id lead
```
