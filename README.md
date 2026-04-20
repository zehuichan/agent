# Frontend Agent Playground

在浏览器里手撕一个 AI Agent：Chat UI → SSE 流式 → Tool Calling → Agent Loop → 多 Provider。
不套壳框架（LangChain / Vercel AI SDK），核心靠 `fetch` + `ReadableStream` + 类型。

**Status**: `phase-0/bootstrap`

---

## Stack (2026)

| 领域     | 版本                                                                                                  | 说明                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Node     | ≥ 22.13 (22 LTS 及以上)                                                                               | Vite 8 / ESLint 10 的共同下限                                                           |
| 包管理   | pnpm 10                                                                                               |                                                                                         |
| 框架     | Vue 3.5                                                                                               | `<script setup lang="ts">`；3.6 + Vapor Mode 留到 Phase 7                               |
| 语言     | TypeScript 6                                                                                          | strict 全开                                                                             |
| 构建     | **Vite 8**（Rolldown + Oxc）                                                                          | 10-30× 于 Rollup，生产构建提速                                                          |
| 状态     | Pinia 3                                                                                               |                                                                                         |
| 路由     | Vue Router 5                                                                                          |                                                                                         |
| 样式     | **Tailwind CSS v4**                                                                                   | `@tailwindcss/vite` 插件；CSS-first，配置在 `@theme {}` 里，**无** `tailwind.config.js` |
| 工具库   | VueUse 14                                                                                             |                                                                                         |
| Lint     | **ESLint 10** flat config（`eslint.config.ts`）+ `eslint-plugin-vue` ≥ 10.8 + `typescript-eslint` ≥ 8 | v10 起 flat config 唯一形态，无逃生通道                                                 |
| 格式化   | Prettier 3                                                                                            |                                                                                         |
| 类型检查 | vue-tsc (最新)                                                                                        |                                                                                         |
| 可选加速 | oxlint                                                                                                | 与 Vite 8 的 Oxc 同源，作为 CI 前置 lint                                                |

无 UI 组件库，无 LangChain / Vercel AI SDK。原子组件自写，Agent 协议自己撕。

---

## Landscape — 我们知道这些，但主动不装

2026 年的前端 Agent 栈已经很卷了。列出来不是要用，而是**让读者知道我们知道**，并理解"从 0 撕"的价值来自对比。

| 层                    | 主流选项                                                                                                                 | 本项目态度                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| **推理 SDK**          | Vercel AI SDK 6（`ai` + `@ai-sdk/vue`、含 `ToolLoopAgent`）、OpenAI Agents SDK (JS)、Mastra、LangChain.js / LangGraph.js | 不引；Phase 4 之后对照源码学                     |
| **Agent UI**          | `assistant-ui`（React）、CopilotKit（React/Vue/Angular）、`shadcn/ai-elements`                                           | 不引；组件拆法可参考                             |
| **Provider 原生 SDK** | `openai`、`@anthropic-ai/sdk`、`@google/genai`                                                                           | 不引；直接打 OpenAI 兼容 HTTP                    |
| **协议**              | **MCP**（97M 月下载，已入 Linux Foundation）、**AG-UI**（CopilotKit 主导）、A2A（Google）、OpenAI Responses              | Phase 7 做 MCP 客户端；TraceEvent 命名借鉴 AG-UI |
| **可观测**            | Langfuse（OSS）、LangSmith、Helicone、Braintrust、Arize Phoenix                                                          | 自建本地 trace；Phase 5+ 可选接 Langfuse         |
| **记忆 / RAG**        | pgvector / Qdrant / Turbopuffer（服务端）、LanceDB WASM / sqlite-vec / Transformers.js（浏览器内）                       | Phase 7 走浏览器内路线                           |
| **多模型路由**        | OpenRouter、LiteLLM                                                                                                      | Phase 6 讨论，不强制                             |
| **编排 / Workflow**   | LangGraph、Inngest、Temporal、Trigger.dev                                                                                | 纯前端项目，不涉及                               |

> 原则：**能用 fetch + 类型 + 150 行 TS 解释清的概念，就不装库。** 装库这件事留给读者毕业后自己做选型。

---

## Roadmap

| Phase | 主题         | 关键产出                                                                                     | 对标参考（学完再看，不提前抄）                      |
| ----- | ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 0     | Bootstrap    | Vite / TS / Tailwind / ESLint / 路径别名 / CI                                                | —                                                   |
| 1     | Chat UI      | MessageList、ChatInput、Markdown + 代码高亮、虚拟滚动（可选）                                | `assistant-ui`、`shadcn/ai-elements` 的组件拆法     |
| 2     | Streaming    | OpenAI 兼容 client、SSE 解析、`AbortController`、重试                                        | `ai` / `@ai-sdk/vue` 的 `useChat` 做了什么          |
| 3     | Tool Calling | `defineTool` DSL、JSONSchema 校验、tool_calls 往返                                           | Vercel AI SDK `tool()`、OpenAI Agents SDK tool 定义 |
| 4     | Agent Loop   | 多步循环、maxSteps、trace 流、可中断                                                         | AI SDK 6 `ToolLoopAgent` 源码、**AG-UI** 事件命名   |
| 5     | Memory       | IndexedDB 持久化、token 预算、summary 压缩                                                   | LangGraph checkpoint、Mastra memory                 |
| 6     | Providers    | OpenAI / DeepSeek / Ollama 抽象，运行时可切换                                                | OpenAI Agents SDK、OpenRouter / LiteLLM             |
| 7     | 进阶（选做） | **MCP client**、Vue 3.6 Vapor Mode、Web Worker、浏览器内 RAG（Transformers.js + sqlite-vec） | MCP 官方 TS SDK、AG-UI 协议                         |

每个 Phase 一条 branch（`phase/<n>-<topic>`），合并打 tag，写一篇 `docs/phases/<n>.md` 复盘。

---

## Architecture

```
src/
├── agent/              # 框架无关：没有 Vue / DOM / Pinia 的踪迹
│   ├── client/         # Provider 实现（OpenAI / DeepSeek / Ollama）
│   ├── tools/          # defineTool + 内置工具
│   ├── loop.ts         # Agent 主循环
│   ├── stream.ts       # SSE 解析
│   └── types.ts        # ChatMessage / ToolCall / Trace
├── composables/        # useChat / useAgent / useStream — 粘合 agent ↔ Vue
├── stores/             # Pinia: conversations / settings
├── components/
│   ├── chat/           # MessageList / MessageBubble / ChatInput / ToolCallCard
│   └── ui/             # 原子组件
├── views/              # 每个 Phase 一个 demo 页
└── router, main.ts, styles/
```

**硬规则**：`src/agent/` 是纯 TS，不 import Vue / DOM / Pinia。这样可 Node 单测、可以挪到 Worker、可以换框架。

---

## Quick Start

```bash
# 版本前提
node -v   # >= 22.13（22 LTS 及以上）
pnpm -v   # >= 10

pnpm i
cp .env.example .env.local   # 填 VITE_LLM_BASE_URL / VITE_LLM_API_KEY / VITE_LLM_MODEL
pnpm dev
```

> Phase 0 落地后以上命令才可用。

### 环境变量

| Key                 | 说明                                              |
| ------------------- | ------------------------------------------------- |
| `VITE_LLM_BASE_URL` | OpenAI 兼容端点，如 `https://api.deepseek.com/v1` |
| `VITE_LLM_API_KEY`  | 仅本地开发；生产走后端代理                        |
| `VITE_LLM_MODEL`    | 默认模型                                          |

---

## Conventions

- pnpm only；提交走 Conventional Commits。
- `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`，禁 `any`（用 `unknown` + 守卫）。
- 公共导出函数写返回类型；内部闭包信 TS 推断，别过度标注。
- **函数精简明了、贴合语义场景**：一个函数只做一件事，签名即文档；超过 ~40 行或嵌套 >3 层就拆，命名用业务动词短语（`parseSseChunk` 而非 `handleData`）。
- **文件名一律 kebab-case**（含 `.vue`）：`app-header.vue` / `chat-input.vue` / `use-chat.ts` / `settings.ts`。
- **模板里组件名一律 PascalCase**：`<AppHeader />` / `<MessageBubble />`，由 `vue/component-name-in-template-casing` 强制。
- **支持 barrel re-exports**：每个"对外暴露"的目录放 `index.ts` 聚合导出；类型必须用 `export type { ... }`（由 `consistent-type-exports` 强制），保证 `isolatedModules` 下安全。
- 别名 `@/` → `src/`；优先从 barrel 导入：`import { AppHeader } from '@/components/ui'`。
- 样式：Tailwind v4 原子类 + `@theme` token 优先；复杂局部样式 `<style scoped>`。

详细协作契约见 [AGENTS.md](./AGENTS.md)。

---

## References

- [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat) · [Tool Calling](https://platform.openai.com/docs/guides/function-calling)
- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Model Context Protocol](https://modelcontextprotocol.io/)

MIT.
