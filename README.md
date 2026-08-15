# Agent

CRM 的智能后端服务（对应源码目录 `apps/agent`）。独立部署，负责 enrichment、身份匹配、调研与自定义 agent 执行。Nest API 只写 `AgentTask` 行；本服务认领任务并执行。

文档依据：[eve.dev](https://eve.dev/docs) · 仓库内 `docs/agent.md`

---

## 技术栈一览

| 层 | 技术 |
| --- | --- |
| 语言 | TypeScript（ESM） |
| 运行时 | Bun |
| Agent 框架 | [eve](https://eve.dev) `^0.29.4` |
| Schema / 校验 | Zod |
| 数据访问 | `@crm/db`（Prisma + PostgreSQL） |
| 模型网关 | Vercel AI Gateway |
| 默认模型 | `zai/glm-5.2-fast`（存 `AppSetting`，非 env） |
| Lint | Biome |
| 类型检查 | `tsc --noEmit` |
| 测试 | `bun test` |
| Eval | `eve eval` |
| Monorepo | Turborepo |
| 本地端口 | `:2000` |

---

## 核心依赖

### 直接依赖（`package.json`）

| 包 | 作用 |
| --- | --- |
| `eve` | 文件系统优先的 durable AI agent 框架 |
| `zod` | 边界校验与 domain schema |
| `context.dev` | 公司品牌 / 域名情报 |
| `@crm/db` | Prisma、任务队列、Blob 镜像、设置 |
| `@crm/env` | 环境变量加载 |
| `@crm/telemetry` | 遥测 |
| `@crm/validation` | 共享校验 |

### 开发依赖

| 包 | 作用 |
| --- | --- |
| `typescript` | 类型系统 |
| `microsandbox` | Sandbox 后端之一 |
| `just-bash` | Sandbox / bash 工具辅助 |
| `@crm/typescript-config` | 共享 TS 配置 |

---

## eve 是什么

[eve](https://eve.dev) 是 npm 包，用于构建 durable 后端 AI agent。Agent 是磁盘上的目录：instructions、tools、skills、channels、schedules、subagents 都是文件；eve 负责发现、编译与运行。

常用命令：

```bash
eve dev              # 交互式开发（TUI）
eve dev --no-ui      # 无 TUI
eve build            # 生产构建
eve eval             # 行为评测
```

文档以安装版本为准：`node_modules/eve/docs/README.md`。

---

## 目录结构（eve 约定）

```text
apps/agent/
├── package.json
├── agent/                    # eve 发现的 agent 根
│   ├── agent.ts              # 运行时配置（模型等）
│   ├── instructions.md       # 系统提示
│   ├── channels/             # HTTP / 消息入口
│   │   ├── crm.ts            # CRM 内部桥
│   │   └── eve.ts
│   ├── tools/                # 可调用工具
│   ├── skills/               # 按需技能（markdown）
│   ├── hooks/                # 生命周期钩子
│   ├── schedules/            # 定时 / dispatch
│   │   └── dispatch.ts
│   ├── sandbox/              # 执行隔离
│   ├── lib/                  # 共享业务逻辑
│   └── subagents/
│       ├── agent_builder/    # 构建自定义 agent
│       └── agent_runner/     # 执行自定义 agent
├── evals/                    # 评测（在 agent/ 外）
├── test/                     # bun 测试
└── scripts/
```

路径即身份：`agent/tools/get_weather.ts` → tool `get_weather`。

---

## 架构

```text
Nest API  ──写 AgentTask / poke──►  Agent (eve :2000)
                                      │
                 ┌────────────────────┼────────────────────┐
                 ▼                    ▼                    ▼
           Visible lane         Research lane          Subagents
         brand / portrait      LLM session/turn     builder / runner
         （不经模型）            （经 eve session）
                 │                    │
                 └─────────┬──────────┘
                           ▼
                  Postgres + 外部 API
```

### 两条调度车道

| 车道 | 任务种类 | 执行方式 |
| --- | --- | --- |
| Visible | `brand`, `portrait` | 直接跑，不进模型会话 |
| Research | 其余（identify、sweep、meeting…） | 每个任务一个 eve session |

API 通过 `POST /internal/crm/dispatch` 触发双车道排水。本地 `eve dev` 不按 cron 跑 schedule，需手动 `dispatch`。

### 与 API 的边界

- **智能只住在 Agent**：无 vendor client、无 enrichment、无评分、无身份匹配进入 Nest。
- API 写队列行后 fire-and-forget poke；行本身才是消息。
- 桥接密钥：`AGENT_BRIDGE_SECRET`；未设置则拒绝，不开放。

---

## 外部能力（可选）

缺 key 只关掉能力，不抛错。模式见 `agent/lib/capabilities.ts`。

| 能力 | 配置 | 作用 |
| --- | --- | --- |
| 公司品牌数据 | Context.dev key（Settings，非 env） | logo、行业、地点、社交 |
| 网页研究 | `PERPLEXITY_API_KEY` | 带引用的开放网页调研 |
| LinkedIn | `RAPIDAPI_KEY` | 姓名、职位、雇主等 |
| 图片存储 | `BLOB_READ_WRITE_TOKEN` | 镜像 logo / 头像到 Vercel Blob |
| 模型 | `AI_GATEWAY_API_KEY` 或 Vercel OIDC | LLM 调用 |
| Slack | Connections | 消息投递等 |

图片规则：字节镜像到 Blob，记录只存我方 URL；不按姓名搜脸。

---

## Sandbox

```ts
defineSandbox({
  backend: defaultBackend({
    vercel: { networkPolicy: "deny-all" },
    docker: { networkPolicy: "deny-all" },
    microsandbox: { networkPolicy: "deny-all" },
  }),
});
```

可选后端：Vercel、Docker、microsandbox。默认禁网。

---

## 本地开发

前置：仓库根目录一份 `.env`，Postgres 可用，Bun 已装。

```bash
# 在 monorepo 根
bun run dev                                    # app :3000 · api :3001 · agent :2000

# 仅 agent（headless，适合无 TUI 终端）
turbo run dev:headless --filter=agent

# 手动排水队列（eve dev 不跑 cron）
bun run --filter=agent dispatch

# 类型 / lint / 测试 / eval
bun run --filter=agent check-types
bun run --filter=agent lint
bun run --filter=agent test
bun run --filter=agent eval
```

桥接相关 env：

```bash
AGENT_URL="http://127.0.0.1:2000"   # 用 127.0.0.1，eve dev 仅 IPv4
AGENT_BRIDGE_SECRET="…"
```

健康探活：`GET /eve/v1/info`。

---

## 常用脚本

| 脚本 | 说明 |
| --- | --- |
| `dev` | `eve dev` |
| `dev:headless` | `eve dev --no-ui` |
| `build` | `eve build` |
| `start` | `bun scripts/start.ts` |
| `dispatch` | 触发双车道 drain |
| `test` | `bun test` |
| `eval` | `eve eval` |
| `check-types` | `tsc --noEmit` |
| `lint` | `biome check .` |

---

## 相关文档（源仓库）

| 文档 | 内容 |
| --- | --- |
| `docs/agent.md` | Agent 行为与约束（必读） |
| `docs/api.md` | API 边界：智能不得迁入 Nest |
| `docs/setup.md` | 本地、桥接、dispatch |
| `docs/environment.md` | 环境变量 |
| `docs/agent-panel.md` | 记录页 Agent 面板 |
| `.agents/skills/eve` | eve 技能入口 |

---

## 设计原则（摘要）

1. **智能在 Agent，不在 API。**
2. **队列行是消息**；poke 不 await。
3. **可选能力永不抛错**；缺 key 只移除能力。
4. **不猜测人**：工具报告观测来源，证据账本定价；弱证据只成建议。
5. **边界解析**：JSON / webhook / 外部响应用 Zod 在入口解析成 domain 类型。
6. **可调常量集中**到 area config（如 `dispatch-config.ts`），不散落 magic number。

---

## License

与主 CRM 仓库一致（MIT）。
