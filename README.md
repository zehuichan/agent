# Agent

可部署的 Agent 后端。本文件只落地 **两套对照目录**，用来选骨架，不写业务实现。

| 套 | 名称 | 命题 |
| --- | --- | --- |
| **A** | 框架型（Agent-first） | Agent 是产品；业务系统是它的笔记与队列 |
| **B** | 传统 SaaS 外挂聊天框 | 业务系统是产品；聊天是侧栏功能 |

本仓走 **A**。B 只作反面参考，避免把 loop 塞进 CRUD 路由。

---

## 怎么读

先看差异，再对号入座目录。

```text
A：人 / 别的系统  →  API（只写任务 / 转发会话）  →  Agent 进程（唯一智能）
                                                      →  队列认领、工具、技能、eval

B：人  →  Web CRUD  →  API（领域逻辑 + 顺手调模型）
         ↘  ChatWidget  →  /api/chat（同进程、无队列、无独立部署）
```

---

## A — 框架型目录（Agent-first）

参考系：[trycompai/crm](https://github.com/trycompai/crm)、[simieco/simie](https://github.com/simieco/simie)。  
运行时用 LangGraph（或 eve 同类）；**目录约定学 eve**（一文件一工具 / 一技能），不绑死框架品牌。

### 进程

```text
apps/web          体验：会话、任务列表、run 时间线
apps/api          薄壳：鉴权、入队、查 run；不调模型、不 enrich
apps/agent        唯一智能进程：对话 loop + claimDue
packages/*        契约与数据，不含编排
```

关浏览器之后 `apps/agent` 仍认领队列。poke 不 await；**任务行才是消息**。

### 目录

```text
agent/
├── AGENTS.md                      # 边界：智能只在 apps/agent
├── ROADMAP.md                     # 产品里程碑（可对话 / 可投工 / 可查 run）
├── .env.example                   # 只从仓库根加载
├── package.json                   # workspaces: apps/*  packages/*
│
├── apps/
│   ├── web/                       # 壳。不跑 loop
│   │   ├── app/                   # 页面：chat / tasks / runs / settings
│   │   ├── components/            # 纯渲染；不 import 服务端包
│   │   └── lib/                   # API client、session 协议
│   │
│   ├── api/                       # 笨。只写库、转发、鉴权
│   │   └── src/
│   │       ├── routes/
│   │       │   ├── health.ts      # GET /health
│   │       │   ├── chat.ts        # POST /v1/chat（转给 agent 或入队）
│   │       │   ├── tasks.ts       # POST /v1/tasks  GET /v1/tasks/:id
│   │       │   └── runs.ts        # GET /v1/runs/:id  事件时间线
│   │       ├── auth/
│   │       └── trpc-or-http/
│   │
│   └── agent/                     # 聪明。独立部署
│       ├── evals/                 # 发布门禁，不是练习册
│       ├── test/
│       └── src/
│           ├── graph.ts           # LangGraph ReAct / 状态图
│           ├── bootstrap.ts       # 根目录 .env、模型入口
│           ├── capabilities.ts    # 缺 key 只减菜单，不抛错
│           ├── instructions.md    # 系统策略
│           ├── tools/             # 一文件一工具 + zod + 副作用说明
│           │   ├── search.ts
│           │   └── record_note.ts
│           ├── skills/            # markdown，按需读入上下文
│           ├── schedules/
│           │   └── dispatch.ts    # 只租约到期行，不决策
│           ├── sandbox/           # 可选；bash / 文件，默认禁网
│           ├── hooks/             # audit / telemetry / 预算
│           └── lib/
│               └── tasks.ts       # claimDue；FOR UPDATE SKIP LOCKED
│
├── packages/
│   ├── shared/                    # TaskSpec / WorkerResult / 错误类型
│   │   └── src/
│   │       ├── task.ts            # { id, goal, tools? }
│   │       └── worker.ts          # { taskId, conclusion, evidence[] }
│   ├── db/                        # session / task / event；先 SQLite
│   ├── env/                       # 只解析仓库根 .env
│   └── ui/                        # 可选；web 与设计系统
│
└── docs/
    ├── architecture.md            # 本套图
    └── boundaries.md              # API 禁止事项清单
```

### 层 → 目录

| 层 | 落点 | 不做什么 |
| --- | --- | --- |
| 体验 | `apps/web` | 不跑 loop、不调供应商 |
| 控制 / 入队 | `apps/api` | 不 enrich、不打分、不身份匹配 |
| 编排 | `apps/agent/src/graph.ts` | 不直连 UI |
| 工具 / 技能 | `tools/` `skills/` | 不报自信分，只报观测 |
| 数据 | `packages/db` | 不藏业务智能 |
| 契约 | `packages/shared` | 蜂群只留类型，不实现 fan-out |
| 质量 | `apps/agent/evals` | 不靠肉眼当回归 |

### 硬规则

1. 智能只住 `apps/agent`。
2. 队列行是消息；HTTP 不驮完整 loop。
3. 缺能力只减菜单，不抛错。
4. 工具报告观测来源，不报告 confidence。
5. 无 `examples/`：验证打 API，或跑 test / eval。

### 产品完成线（A）

| 阶段 | 必须能对外提供 |
| --- | --- |
| P0 | `/health` `/v1/chat` `/v1/tasks` `/v1/runs/:id` + SQLite |
| P1 | `apps/web`：会话、任务、时间线 |
| P2 | Postgres、Checkpoint / HITL、技能热更新 |
| P3 | 固定 subagent 或 fan-out、沙箱、一条垂类加深 |

---

## B — 传统 SaaS 外挂聊天框目录

多数「AI CRM / AI 后台」是这套：先有完整 CRUD 产品，再在页面角落加 ChatWidget，`/api/chat` 与业务 API **同进程**。

参考反例：传统 CRM / 工单 / 后台在路由里 `openai.chat()`，无独立 agent 部署、无任务租约、无线下执行。

### 进程

```text
apps/web     业务页面 + 侧栏 ChatWidget
apps/api     领域 CRUD  +  /chat 调模型（智能泄漏在这里）
（没有 apps/agent）
```

关浏览器，模型调用一起停。没有「投工」只有「再问一句」。

### 目录

```text
saas/
├── package.json
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── contacts/          # 业务主路径
│   │   │   ├── companies/
│   │   │   ├── deals/
│   │   │   └── settings/
│   │   ├── components/
│   │   │   ├── contact-form.tsx   # CRUD 才是主体
│   │   │   ├── deal-board.tsx
│   │   │   └── chat-widget.tsx    # 外挂：浮动球 / 侧栏
│   │   └── lib/
│   │       └── chat-client.ts     # POST /api/chat，SSE 展示
│   │
│   └── api/
│       └── src/
│           ├── modules/
│           │   ├── contacts/      # 领域服务、仓储、权限
│           │   ├── companies/
│           │   ├── deals/
│           │   ├── auth/
│           │   └── chat/          # 后加的一层
│           │       ├── chat.controller.ts   # POST /api/chat
│           │       ├── chat.service.ts      # 拼 prompt、调 SDK
│           │       ├── prompts/             # 和业务模块并列，无生命周期
│           │       └── tools/               # 常直接 import 领域 service
│           ├── prisma/            # 业务表为主
│           └── main.ts
│
├── packages/
│   ├── ui/
│   ├── db/                        # Contact / Deal / User；无 AgentTask
│   └── shared/                    # DTO；无 TaskSpec / WorkerResult
│
└── docs/
    └── product.md                 # 业务说明；无 agent 边界文
```

常见变体（仍是 B，只是聊天代码换地方）：

```text
apps/web/app/api/chat/route.ts     # BaaS / Next 单体：前端仓里直接调模型
packages/ai/                       # 后来抽出的 SDK 封装，loop 仍在请求里
```

### 层 → 目录

| 层 | 落点 | 实际效果 |
| --- | --- | --- |
| 体验 | 业务页 + `chat-widget.tsx` | 聊天从属于表单 |
| 领域 | `api/src/modules/*` | 主体，正确 |
| 智能 | `modules/chat` 或 `app/api/chat` | 与请求同生共死 |
| 工具 | chat 模块内 import service | 易越权、难审计 |
| 记忆 | 往往只有 `messages[]` 或一张 ChatLog | 无任务、无 run 事件 |
| 质量 | 通常没有 evals | 靠点几次 Widget |

### B 的结构特征（用来识别，不是优点）

1. **没有** `apps/agent` 独立进程。
2. **没有** `AgentTask` / `claimDue`；「工作」= 用户还开着页面。
3. Prompt / tool 挂在 `chat` 模块，和 `contacts` 平级，不拥有调度。
4. Widget 只消费 `POST /api/chat`，不消费任务队列。
5. 供应商 SDK 出现在 API 或 Next route，违反「壳不跑 loop」的产品边界。

---

## 对照

| | A 框架型 | B 外挂聊天框 |
| --- | --- | --- |
| 产品中心 | Agent 的 run / 任务 | 联系人 / 订单 / 工单表单 |
| 智能进程 | `apps/agent` 常驻 | 无；跟 HTTP 请求走 |
| API | 入队、查 run | CRUD + `/chat` |
| 关浏览器 | 队列继续 | 停止 |
| 工具 | `apps/agent/src/tools` + schema | `chat/tools` 直调领域 |
| 技能 | `skills/*.md` 版本化 | 散落字符串 |
| 数据 | session / task / event | 业务表 + 可选 ChatLog |
| 质量 | `evals/` 门禁 | 无 |
| 目录信号 | 有 `dispatch` / `claimDue` / `capabilities` | 有 `chat-widget` / `chat.service` |
| 演进 | 加工具与任务种类 | 加业务模块，聊天越来越胖 |
| 典型结局 | 垂直 Agent 产品 | 侧栏问答，写库不可靠 |

同一业务（例如 CRM）两种摆法：

```text
A  crm/
    apps/app          记录与 Agent 面板（展示 run）
    apps/api          只写 AgentTask
    apps/agent        调研 / 入账 / 再检查

B  crm/
    apps/web          记录表单 + 右下角气泡
    apps/api          contacts + chat.service（里面 research）
```

---

## 本仓选择

采用 **A**。不建 `examples/`，不建 B 的 `chat-widget` / `modules/chat`。

第一批对外接口（A · P0）：

```text
GET  /health
POST /v1/chat
POST /v1/tasks
GET  /v1/runs/:id
```

`packages/shared` 预留蜂群缝（`TaskSpec` / `WorkerResult`），P0 只跑一个 worker，不实现扇出。
