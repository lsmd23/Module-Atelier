# Module Atelier — Global Agent Rules

这些规则适用于所有在本仓库工作的 Agent。更具体的模块约定以 `docs/CONTRACTS.md` 和 `docs/INTEGRATION.md` 为准。

## Product boundary

Module Atelier 是专业的 TTRPG 创作 IDE：Human creates, Agents assist, Compiler publishes。AI 不得未经作者确认修改正式作品；没有高价值建议时允许返回 `NO_SUGGESTION`。

## Technical baseline

- Node.js 24、pnpm workspace、TypeScript `strict`。
- API：Fastify + Zod；数据库：PostgreSQL + Drizzle；任务：pg-boss。
- 测试：Vitest；浏览器测试：Playwright；格式化：Prettier；检查：ESLint。
- 不引入 Redis/Kafka，除非 Lead Architect 记录并批准架构决策。

## Shared contracts

- 跨模块类型只能来自 `packages/contracts`，禁止复制第二套模型。
- 可变资源使用 `revision` + `baseRevision` 乐观并发控制；冲突必须返回结构化 `CONFLICT`，禁止静默覆盖。
- 数据库使用 UUID、UTC `timestamptz`、snake_case；TypeScript/API 使用 camelCase。
- Publisher 依赖独立 Module IR，不直接依赖数据库表或 React。

## Ownership

- `apps/web`, `packages/ui`: Frontend
- `apps/api`, `packages/db`, `packages/domain`: Backend/Domain
- `packages/agent`, `apps/worker/src/agents`: Agent Systems
- `packages/publisher`, `apps/worker/src/publish`: Publishing
- `infra`, `.github`, `tests/e2e`: Platform/QA
- `packages/contracts`, `docs`, integration glue: Lead Architect

跨 ownership 修改前必须在 handoff 或 message 中说明原因和影响。

## Working rules

- 开始工作先读本文件、`docs/STATUS.md`、`docs/CONTRACTS.md`，再检查 `git status`。
- 不提交真实密钥；新增配置提供 `.env.example`。
- 测试结果必须区分 PASS、FAIL、NOT RUN、MOCK ONLY；不得把设计或 mock 说成已完成。
- 不为“看起来完整”提前创建空模块；按当前 milestone 增量实现。
- 每次交接说明修改文件、测试证据、contract 变化、风险和未完成项。
