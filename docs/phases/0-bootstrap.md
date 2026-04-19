# Phase 0 — Bootstrap

> 目标：一条 `pnpm i && pnpm dev` 就能跑起来的空壳。
> 状态：✅ 完成（typecheck + lint + build 全绿）。

## 落地物

```
.
├── package.json              # engines、scripts、deps 版本锁定（caret）
├── pnpm-lock.yaml            # 首次 install 后生成，需 commit
├── .npmrc                    # engine-strict=true
├── .nvmrc                    # node 22
├── .gitignore / .prettierignore / .editorconfig / .env.example
├── tsconfig.json             # project references
├── tsconfig.app.json         # src 严格模式
├── tsconfig.node.json        # 配置文件专用
├── vite.config.ts            # vue + @tailwindcss/vite + @/ 别名
├── eslint.config.ts          # flat config（ESLint 10）
├── prettier.config.js
├── index.html
├── public/favicon.svg
├── src/
│   ├── main.ts
│   ├── App.vue
│   ├── env.d.ts
│   ├── router/index.ts
│   ├── stores/
│   │   ├── index.ts          # barrel
│   │   └── settings.ts
│   ├── styles/app.css        # @import "tailwindcss" + @theme
│   ├── components/ui/
│   │   ├── index.ts          # barrel
│   │   └── app-header.vue
│   ├── views/
│   │   ├── index.ts          # barrel
│   │   └── home-view.vue
│   └── agent/
│       ├── index.ts          # barrel（纯 type re-export）
│       └── types.ts          # 框架无关，Phase 2 才开始丰富
└── docs/phases/0-bootstrap.md
```

## 关键决策

1. **TS 6 + project references**
   - `tsconfig.app.json` 只管 `src/`，开 `strict` 全套加 `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noImplicitReturns` / `verbatimModuleSyntax` / `isolatedModules`。
   - `tsconfig.node.json` 管 `*.config.ts`，避免配置文件被 `dom` lib 污染。

2. **Tailwind v4 CSS-first**
   - `src/styles/app.css` 里 `@import "tailwindcss"` + `@theme { ... }` 声明主题 token。**没有** `tailwind.config.js`。
   - `vite.config.ts` 挂 `@tailwindcss/vite` 插件即可，内容扫描自动。

3. **ESLint 10 flat + typescript-eslint 8 project service**
   - `parserOptions.projectService: true` 替代老的 `project: true`，由 typescript-eslint 自动推断哪个 tsconfig 管哪个文件，省心且更快。
   - `.vue` 文件走 `vue-eslint-parser`，其中 `<script lang="ts">` 转交给 `tseslint.parser`。
   - `.js / .mjs / .cjs` 单独走 `tseslint.configs.disableTypeChecked`，避免 prettier.config.js 这类文件触发 type-aware 规则崩溃。
   - `eslint-config-prettier` 摆最后一位，关掉与 Prettier 冲突的格式规则。
   - 关键规则：
     - `consistent-type-imports` / `consistent-type-exports` —— 保证 barrel 下 `isolatedModules` 安全
     - `vue/component-name-in-template-casing: PascalCase` —— 强制模板里驼峰
     - `no-floating-promises` / `no-misused-promises` —— 后续异步 Agent 代码守门

4. **文件/组件命名双轨制**
   - 文件一律 kebab-case（含 `.vue`）：`app-header.vue` / `home-view.vue`
   - 模板里引用用 PascalCase：`<AppHeader />` / `<HomeView />`
   - 组件默认导出名 / `name` 用 PascalCase（SFC 默认导出名与 `vue/component-definition-name-casing` 一致）

5. **Barrel re-exports**
   - `src/agent/index.ts` / `src/components/ui/index.ts` / `src/stores/index.ts` / `src/views/index.ts` 聚合导出
   - 类型一律 `export type { ... }`
   - Vue Router 的 `() => import('@/views/home-view.vue')` **不**走 barrel，保留按路由 code-split

6. **Vue Router 5 的 Pinia optional peer**
   - v5 起 `pinia` / `@pinia/colada` 是 optional peer。我们装 `pinia`（要用），**不装** `@pinia/colada`。

7. **`src/agent/` 框架无关预占位**
   - 只放 `types.ts` + 纯 type barrel。避免 Phase 1-2 写 UI 时不小心往里塞 Vue import。
   - AGENTS.md §3 的红线从第一天就立起来。

## 被拒的方案

- **`pnpm create vite` 脚手架**：模板带 `HelloWorld.vue` / `vue.svg` / 一堆 SFC 示例，还要再删。直接手写目录更干净。
- **`unplugin-auto-import` / `unplugin-vue-components`**：显式 import 阅读体验更好，Agent 协议代码需要立即追到定义。
- **`@vue/eslint-config-typescript` / `@vue/eslint-config-prettier`** 预设包：屏蔽细节，不如自己组合 `typescript-eslint` + `eslint-plugin-vue` + `eslint-config-prettier`。
- **Phase 0 引入测试框架**：Phase 0 尚未产生值得测的业务代码，先保持骨架干净。Phase 2+ 再按需回装 Vitest。

## 验收命令

```bash
pnpm install

pnpm typecheck    # vue-tsc --noEmit
pnpm lint         # eslint .
pnpm build        # vue-tsc + vite build
pnpm dev          # vite 8 dev server
```

实测构建产物：Vite 8 + Rolldown ~574ms，35 modules。

## 下一步 → Phase 1 · Chat UI

- `ChatMessage` 从 `src/agent/types.ts` 流入 UI 视图
- `MessageList` / `MessageBubble` / `ChatInput`（都 kebab-case 文件名）
- Markdown 渲染（自己撕 or 用 `marked` + 代码高亮 `shiki`，Phase 1 再选）
- 消息 mock 数据来源：一个 `fixtures/conversation.json`
