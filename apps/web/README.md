# @module-atelier/web

Module Atelier 创作工作台（React + Vite + CodeMirror 6 + Tailwind v4）。

## 运行

```bash
pnpm install
pnpm dev        # 默认 MOCK 数据（无需后端）
pnpm test       # Vitest 单元测试
pnpm build      # 类型检查 + 产物构建
```

## 数据源

- 默认 `mock`：全部数据来自 `src/api/mock/`（MOCK ONLY，内存态，刷新即重置）。
- `VITE_API_MODE=http` 切换到 `src/api/httpApi.ts`，对接 BE-001 冻结的 M0 路由
  （projects / documents / entities；envelope `{ data }` / `{ error }`，CONFLICT 409）。
  suggestions / patchsets / questions / preview 在 contracts 0.2.0 中尚无路由，
  httpApi 会抛 `ROUTE_NOT_IN_CONTRACT` —— 这些功能目前只有 mock 实现。

## 关键设计

- `src/state/useDocumentSession.ts`：文档会话。autosave（1.5s 防抖）、保存状态机、
  IndexedDB 草稿、恢复决策。编辑器挂载期间其内容是唯一事实来源。
- `src/editor/MarkdownEditor.tsx`：IME 安全（composition 期间挂起调度）；
  React 永不把外部内容 dispatch 进编辑器，外部更新一律整棵重建（key）。
- `src/preview/mockRenderer.ts`：MOCK ONLY 排版器，正式渲染必须由 Publisher 提供。
- AI 干预模式、建议收件箱、补丁审阅的交互规则见任务书 13–21 节。
