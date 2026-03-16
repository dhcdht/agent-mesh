# Phase 4 可观测性与 Dashboard 增强

## 新增 API

- `GET /api/v1/meshes` — 列出所有 mesh
- `GET /metrics` — 指标（meshes、tasks 按状态、agents、messages 数量）

## Dashboard 增强

- Mesh 下拉选择（从 API 加载）
- 支持手动输入 mesh ID
- 自动刷新（10 秒间隔，可关闭）

## CLI

- `mesh:list` — 列出所有 mesh

## 后续（分布式）

- PostgreSQL 迁移
- Redis 分布式锁
- 多实例部署
