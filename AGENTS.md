# AGENTS.md

写给在本仓库里写代码的 AI 助手。人类看 [README.md](./README.md)。

维护者是**资深前端**，偏好直觉式编程：**少仪式、少解释、直接动手**，但架构边界要守住。

---

## 1. 工作方式

- **不要问"要不要我帮你做 X"**。能做的直接做，做完给 diff。
- **不要写套话**（"很高兴帮您……"）。直给结论、差异、风险。
- **小步提交**：一个 commit 一个主题；但 **不要自动 `git commit / push`**，由维护者发起。
- **看 Roadmap 当前 Phase，只做当前 Phase 的事**。跨 Phase 的重构先说一声。
- **没跑过不要说"测试通过"**。要么跑，要么说"未验证"。

---

## 2. 技术栈（锁定，换前先问）

- **Runtime**：Node `>=22.13.0`（22 LTS 及以上）· pnpm 10
- **框架**：Vue 3.5（`<script setup lang="ts">`）· TypeScript 6 strict
- **构建**：Vite 8（Rolldown + Oxc）
- **生态**：Pinia 3 · Vue Router 5 · VueUse 14
- **样式**：Tailwind CSS v4（`@tailwindcss/vite` + CSS-first `@theme`；**禁** `tailwind.config.js`）
- **Lint/Format**：**ESLint 10** flat config（`eslint.config.ts`）+ `eslint-plugin-vue` ≥ 10.8 + `typescript-eslint` ≥ 8 + Prettier 3
- **类型检查**：vue-tsc
- **测试**：**Phase 0 暂不接入测试框架**。未来按需回装（优先 Vitest + @vue/test-utils），新增时先问

**不引入（硬红线，装前必须问）**：

- **Agent / LLM SDK**：`ai` / `@ai-sdk/*`、`@openai/agents`、`@mastra/*`、`langchain` / `@langchain/*` / `@langgraph/*`、`openai`、`@anthropic-ai/sdk`、`@google/genai`
  → 本项目对标 OpenAI 兼容 REST，用 `fetch` 直打
- **Agent UI**：`@copilotkit/*`、`@assistant-ui/*`、`@shadcn/ai-elements`、任何官方 Agent chat 组件包
  → 原子组件自写
- **组件库**：Element Plus / Naive UI / Ant Design Vue / Vuetify / PrimeVue / Radix Vue / shadcn-vue
- **工具库**：axios、ky、ofetch（用原生 `fetch`）；eventsource / eventsource-parser（自己解 SSE）；lodash / lodash-es 整包（需要啥挑啥写）
- **Vue 生态糖**：`unplugin-auto-import`、`unplugin-vue-components`（显式 import 利于阅读 Agent 协议层）
- **观测 / 评测**：`langfuse`、`langsmith`、`helicone`、`braintrust` —— Phase 5+ 再议
- **向量 / RAG**：任何向量库 SDK（Phase 7 前不触及）

**能用 Web API 搞定的就不装库**：
`structuredClone` / `EventTarget` / `AbortController` / `fetch` + `ReadableStream` + `TextDecoderStream` / `crypto.randomUUID()` / `Intl.*`。

**可参考不可依赖**：Phase 4 实现 Agent Loop 前后，可以**读** Vercel AI SDK 6 的 `ToolLoopAgent` 源码、AG-UI 协议事件定义、OpenAI Agents SDK 的 handoff 原语 —— 参考命名与边界切分，**不复制代码、不装包**。

**Vue 3.6 / Vapor Mode**：仅允许在 Phase 7 的隔离子路由里实验，主线代码保持 3.5 兼容。

---

## 3. 架构红线

`src/agent/` 是**纯 TS 核心**：
- 不 import `vue` / `pinia` / `@vueuse/*` / DOM API（除了 `fetch` / `AbortController` / `ReadableStream` / `TextDecoder` 这类 Web 标准）。
- 可以在 Node 环境被单测。
- 对外只暴露类型与纯函数/类；状态托管给 composables。

`src/composables/` 是**胶水**：Vue 响应式 ↔ agent core。
`src/components/` 只消费 composables，不直连 `src/agent/`。

破了这条线的 PR 一律打回。

---

## 4. 代码风格（直觉式，非教条）

### TypeScript
- `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`。
- 禁 `any`；用 `unknown` + 守卫或 `satisfies`。
- **导出 API 标注返回类型；内部函数信推断**。
- 偏好 `type` 用于联合/映射，`interface` 用于可扩展对象。
- 宁可 `as const` 加字面量，也别到处 `as Foo`。

### Vue
- `<script setup lang="ts">` 唯一形态。
- Props/Emits 用泛型 `defineProps<T>()` / `defineEmits<{...}>()`，不搞 runtime 声明。
- 模板里复杂表达式抽 `computed`。
- 超过 ~250 行或职责多于一件事的组件拆开。
- 副作用优先 `watchEffect` / `useXxx`，别在 `onMounted` 里堆。

### 样式（Tailwind v4）
- 配置只在 `src/styles/app.css` 的 `@theme { ... }` 里写，**不建** `tailwind.config.js`。
- 入口 CSS 用 `@import "tailwindcss";`，Vite 里挂 `@tailwindcss/vite`。
- 优先 Tailwind 原子类；`class-variance-authority` / `tailwind-variants` 之类按需引入（先问）。
- 颜色/间距走 `@theme` 里定义的 CSS 变量，别硬编码 hex。
- `<style scoped>` 只在样式确实需要封装时用。

### 注释
- 写**为什么**，不写**做了什么**。
- 代码能讲清楚的别加注释。
- 有 trade-off / 踩坑点 / 协议约束 → 必须写清。

### 命名
- **所有源码文件一律 kebab-case**，包括 `.vue`：`app-header.vue` / `message-bubble.vue` / `use-chat.ts` / `settings.ts`。
  禁止 `AppHeader.vue` / `HomeView.vue` 这种 PascalCase 文件名。
- **模板里组件一律 PascalCase**：`<AppHeader />`、`<MessageBubble />`。kebab-case（`<app-header />`）会被 lint 拦。
- **组件 `name` / SFC 默认导出** 遵循 PascalCase（`vue/component-definition-name-casing` 强制）。
- Pinia store：`src/stores/<name>.ts`，导出 `use<Name>Store`。
- Composable：`use-<name>.ts`，导出 `use<Name>`。
- 路径别名 `@/` → `src/`。

### Re-exports / barrel
每个"对外暴露"的目录放 `index.ts` 做聚合导出，消费方**优先**从 barrel 导入：

```ts
// src/components/ui/index.ts
export { default as AppHeader } from './app-header.vue'

// 消费
import { AppHeader } from '@/components/ui'
```

硬约束：
- 类型必须用 `export type { ... } from './x'`（`consistent-type-exports` 强制）。混写 `export { type Foo, bar }` 也禁。
- Router 的懒加载（`() => import('@/views/home-view.vue')`）**不走 barrel**，保留直连以便 Vite 按路由做 code-splitting。
- 别搞"反向依赖"：`agent/` 永远不能出现在 `components/` 的 barrel 里（会绕开 §3 的红线）。

---

## 5. Agent 核心协议

所有消息**贴 OpenAI Chat Completions**，便于后续多 Provider：

```ts
type Role = 'system' | 'user' | 'assistant' | 'tool';

interface ChatMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string }; // arguments 是 JSON 字符串，保留原样
}
```

### Tool DSL

```ts
interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  parameters: JSONSchema;              // 给 LLM
  execute(input: I, ctx: ToolContext): Promise<O>;
}
```

约束：
- `execute` 不抛未捕获异常；失败返回 `{ ok: false, error }` 结构。
- 入参必须先按 `parameters` 校验。
- 不碰 DOM；需要 UI 反馈走 `ctx.emit(event)` 或 store。

### Loop

- 可被 `AbortSignal` 中断。
- `maxSteps`（默认 10），`maxToolCallsPerStep`，超限优雅终止。
- 每一步发 `TraceEvent`（`plan` / `tool_call` / `tool_result` / `message` / `error`），便于调试面板订阅。
- 不隐式改上下文窗口；裁剪放 memory 模块。

---

## 6. 依赖策略

加依赖前自问三题：
1. 能用标准 Web API 做吗？
2. 能用 <50 行写个最小实现吗？
3. 这个库体积/维护状态过关吗？

两个"是"就别加。加了要在 PR 说明里写清理由。

---

## 7. 安全

- API Key 只走 `.env.local`，不进代码、不进仓库、不进截图。
- 生产部署必须经后端代理（key 不下发浏览器），在 README 里长期提醒。
- 外部 URL 的 fetch 走白名单校验，防 SSRF 幻觉（后续 Phase 的工具场景）。

---

## 8. 命令（Phase 0 之后）

```bash
pnpm dev            # Vite 8 dev server
pnpm build          # vue-tsc --noEmit && vite build
pnpm preview        # 预览产物
pnpm typecheck      # vue-tsc --noEmit
pnpm lint           # eslint .（flat config）
pnpm lint:fix       # eslint . --fix
pnpm format         # prettier --write .
pnpm format:check   # prettier --check .
```

Node < 22.13 直接拒绝安装（`package.json.engines.node: ">=22.13.0"` + `.npmrc` 的 `engine-strict=true`）。

ESLint 10 **只认 flat config**：配置文件必须是 `eslint.config.ts`（或 `.js/.mjs`），**禁止** 提交 `.eslintrc.*` / `.eslintignore` / `ESLINT_USE_FLAT_CONFIG` 兜底。

Phase 完成闸门：`typecheck` + `lint` + `build` 全绿 → 更新 Roadmap → 写 `docs/phases/<n>.md`。

---

## 9. 硬红线

- 不擅改技术栈 / 加依赖 / 删文件。
- 不自己 `git commit` / `push` / `reset --hard` / `force push`。
- 不在 `src/agent/` 里出现 Vue / DOM / Pinia。
- 不用 `any` 逃避。
- 不伪造验证结果。
- API Key 不硬编码。

---

## 10. 自更新

每个 Phase 结束：检查本文档是否需要更新当前阶段、是否有新约定。更新走 `docs(agents): <what>`。

与 README 冲突时以本文档为准。
