# Agent

可部署的 Agent 后端。本文件只落地 **三套对照目录**，用来选骨架，不写业务实现。

| 套 | 名称 | 命题 |
| --- | --- | --- |
| **A** | 队列服务型 | Agent 是常驻服务；任务行是消息 |
| **B** | 传统 SaaS 外挂聊天框 | 业务系统是产品；聊天是侧栏功能 |
| **C** | 分层库 / harness | Agent 是库；产品是装配它的那个包 |

本仓走 **C 的分层 + A 的队列层**。B 只作反面参考，避免把 loop 塞进 CRUD 路由。

---

## 怎么读

先看差异，再对号入座目录。

```text
A：人 / 别的系统 → API（只写任务）→ Agent 进程（唯一智能）→ 队列认领

B：人 → Web CRUD → API（领域逻辑 + 顺手调模型）
       ↘ ChatWidget → /api/chat（同进程、无队列、无独立部署）

C：宿主（CLI / 服务 / 别人的产品）→ 装配层 → agent 库
                                     ↘ server ←帧协议→ client（可断、可重连）
```

三者不是好坏排序。A 回答「没人看着的时候谁在干活」，C 回答「智能怎么被复用和嵌入」，B 两个都没回答。

---

## A — 队列服务型目录

参考系：[trycompai/crm](https://github.com/trycompai/crm)、[simieco/simie](https://github.com/simieco/simie)。

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
├── package.json                   # workspaces: apps/*  packages/*
│
├── apps/
│   ├── web/                       # 壳。不跑 loop
│   │   ├── app/                   # 页面：chat / tasks / runs / settings
│   │   └── lib/                   # API client、session 协议
│   │
│   ├── api/                       # 笨。只写库、转发、鉴权
│   │   └── src/routes/
│   │       ├── health.ts          # GET /health
│   │       ├── tasks.ts           # POST /v1/tasks  GET /v1/tasks/:id
│   │       └── runs.ts            # GET /v1/runs/:id  事件时间线
│   │
│   └── agent/                     # 聪明。独立部署
│       ├── evals/                 # 发布门禁，不是练习册
│       └── src/
│           ├── graph.ts           # ReAct / 状态图
│           ├── capabilities.ts    # 缺 key 只减菜单，不抛错
│           ├── instructions.md
│           ├── tools/             # 一文件一工具 + schema + 副作用说明
│           ├── skills/            # markdown，按需读入上下文
│           ├── schedules/
│           │   └── dispatch.ts    # 只租约到期行，不决策
│           └── lib/
│               └── tasks.ts       # claimDue；FOR UPDATE SKIP LOCKED
│
└── packages/
    ├── shared/                    # TaskSpec / WorkerResult
    ├── db/                        # session / task / event
    └── env/                       # 只解析仓库根 .env
```

### 层 → 目录

| 层 | 落点 | 不做什么 |
| --- | --- | --- |
| 体验 | `apps/web` | 不跑 loop、不调供应商 |
| 控制 / 入队 | `apps/api` | 不 enrich、不打分 |
| 编排 | `apps/agent/src/graph.ts` | 不直连 UI |
| 工具 / 技能 | `tools/` `skills/` | 不报自信分，只报观测 |
| 数据 | `packages/db` | 不藏业务智能 |
| 质量 | `apps/agent/evals` | 不靠肉眼当回归 |

### 硬规则

1. 智能只住 `apps/agent`。
2. 队列行是消息；HTTP 不驮完整 loop。
3. 缺能力只减菜单，不抛错。
4. 工具报告观测来源，不报告 confidence。

### A 的盲区

智能和进程绑死。想把同一套 loop 嵌进 CLI、嵌进别人的产品、或换个传输，只能起一个 HTTP 客户端去调它。

---

## B — 传统 SaaS 外挂聊天框目录

多数「AI CRM / AI 后台」是这套：先有完整 CRUD 产品，再在页面角落加 ChatWidget，`/api/chat` 与业务 API **同进程**。

### 进程

```text
apps/web     业务页面 + 侧栏 ChatWidget
apps/api     领域 CRUD  +  /chat 调模型（智能泄漏在这里）
（没有独立 agent）
```

关浏览器，模型调用一起停。没有「投工」只有「再问一句」。

### 目录

```text
saas/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── contacts/          # 业务主路径
│   │   │   └── deals/
│   │   └── components/
│   │       ├── contact-form.tsx   # CRUD 才是主体
│   │       └── chat-widget.tsx    # 外挂：浮动球 / 侧栏
│   │
│   └── api/src/modules/
│       ├── contacts/              # 领域服务、仓储、权限
│       ├── deals/
│       └── chat/                  # 后加的一层
│           ├── chat.controller.ts # POST /api/chat
│           ├── chat.service.ts    # 拼 prompt、调 SDK
│           ├── prompts/           # 和业务模块并列，无生命周期
│           └── tools/             # 常直接 import 领域 service
│
└── packages/
    ├── db/                        # Contact / Deal / User；无 AgentTask
    └── shared/                    # DTO；无 TaskSpec
```

常见变体（仍是 B，只是聊天代码换地方）：

```text
apps/web/app/api/chat/route.ts     # Next 单体：前端仓里直接调模型
packages/ai/                       # 后来抽出的 SDK 封装，loop 仍在请求里
```

### B 的结构特征（用来识别，不是优点）

1. **没有**独立 agent 进程。
2. **没有** `AgentTask` / `claimDue`；「工作」= 用户还开着页面。
3. Prompt / tool 挂在 `chat` 模块，和 `contacts` 平级，不拥有调度。
4. 供应商 SDK 出现在 API 或 Next route，违反「壳不跑 loop」。
5. 记忆往往只有 `messages[]` 或一张 ChatLog：无任务、无 run 事件。

---

## C — 分层库 / harness 目录

参考系：[earendil-works/pi](https://github.com/earendil-works/pi)。这套不是推演，是可以逐行读的实现。

### 形态

**没有 `apps/`，全是 `packages/*`。产品只是带 `bin` 的包。** build 顺序就是依赖顺序，从零依赖的契约包一路装到产品：

```text
telemetry → tui → ai → agent → session-backends → protocol → client → server → 产品
```

agent 是**库**，不是进程。「谁来常驻」由 `server` + `client` 单独回答，不和编排搅在一起。

### 目录

```text
pi/
├── AGENTS.md                       # 开发纪律：风格、git、changelog、发版
├── package.json                    # workspaces: packages/*  packages/session-backends/*
│
├── packages/
│   ├── telemetry/                  # 零依赖。契约 + testing/conformance.ts
│   ├── tui/                        # 差分渲染终端 UI；与 agent 无关
│   ├── ai/                         # 供应商统一 API；模型目录生成
│   │
│   ├── agent/                      # ★ 运行时（库）
│   │   └── src/
│   │       ├── agent-loop.ts
│   │       └── harness/
│   │           ├── tools/          # bash / edit / read / write / image 各一文件
│   │           ├── skills.ts
│   │           ├── system-prompt.ts
│   │           ├── compaction/     # 上下文压缩 + 分支摘要
│   │           └── session/        # entry 树、jsonl/、testing/conformance.ts
│   │
│   ├── protocol/                   # CBOR + 长度前缀分帧 + schema；只依赖校验库
│   ├── client/                     # 远程会话客户端；root 无 node import
│   ├── server/                     # 会话服务器；transports/unix/；testing/
│   ├── session-backends/
│   │   └── sqlite-node/            # migrations/ + storage/
│   │
│   ├── coding-agent/               # 产品 CLI（bin）
│   │   └── src/
│   │       ├── core/               # 装配：session、模型、设置、扩展
│   │       ├── modes/              # interactive（TUI）/ print / rpc（JSONL over stdio）
│   │       ├── client/  server/    # 远程模式的两头
│   │       └── extensions/
│   │
│   └── evals/                      # *.eval.ts + vitest-evals
│
└── .pi/                            # 自举：本仓自己用的 skills / prompts / extensions
```

### 层 → 目录

| 层 | 落点 | 不做什么 |
| --- | --- | --- |
| 契约 | `telemetry` `protocol` | 不依赖实现；依赖数趋零 |
| 供应商 | `ai` | 不知道 agent 存在 |
| 编排 | `agent`（库） | 不选传输、不管进程形态 |
| 工具 / 技能 | `agent/harness/tools` `skills.ts` | 一文件一工具 |
| 状态 | `agent/harness/session` + `session-backends` | append-only；不改历史 |
| 传输 | `protocol` `client` `server` | `server` 不含业务；鉴权归 listener |
| 产品 | `coding-agent` | 唯一知道「全都有谁」的地方 |
| 质量 | `evals` + 各包 `testing/conformance` | 插件靠 conformance 不漂 |

### 三个关键设计

**session 是 append-only 的 entry 树。** entry id 稳定，所以能当游标：`get_entries --since <id>` 跨重启续读。默认落 JSONL，后端可换。压缩、fork、clone 都是往树上加节点，不删历史。

**「关客户端还能跑」靠租约，不靠队列。** session 活在 server 侧，client `detach` 后服务端不停，另一个 client `attach` 回来靠 snapshot 对齐。exclusive / shared 两种租约防并发写。注意这解决的是「多端接同一个会话」，**不是**「没人看着时自己找活干」。

**领域对象和线上 DTO 互不认识。** `ai` 的类型和 `protocol` 的 DTO 是两套，转换职责显式归 `server` 包持有，用编译期字段清单强制「`ai` 加字段必须过一次 review」。

### 硬规则

1. 契约包依赖数趋零。`telemetry` 零依赖，`protocol` 只依赖校验库。
2. 每个可插点配一套 conformance 测试，否则不许可插。
3. agent 是库；进程形态由 `server` / `client` 决定。
4. session append-only；entry id 稳定，可当跨重启游标。
5. 传输中立：root 包不 import 运行时；node 专属能力走子路径导出。
6. 依赖精确 pin，lockfile 提交要闸门。

### C 的盲区

**没有队列，没有定时，没有无人值守。** 所有 run 都由某个客户端发起。要「凌晨三点自己去查一遍」，这套里没有现成的东西。

---

## 对照

| | A 队列服务 | B 外挂聊天框 | C 分层库 |
| --- | --- | --- | --- |
| 产品中心 | run / 任务 | 联系人 / 订单表单 | 包与会话 |
| 智能形态 | 常驻进程 | HTTP 请求内 | 可嵌入的库 |
| 部署单元 | `apps/agent` | 单体 | 带 `bin` 的包 + 可选 server |
| 接缝 | HTTP + 队列表 | 函数调用 | 帧协议（CBOR） |
| 关客户端 | 队列继续 | 停止 | server 侧 session 继续，可重连 |
| 无人值守 | 有（`claimDue`） | 无 | 无 |
| 状态 | task / run / event | `messages[]` | append-only entry 树 |
| 可插点 | 工具 | 无 | 传输 / 后端 / 扩展，各带 conformance |
| 质量 | evals 门禁 | 无 | evals + conformance |
| 目录信号 | `dispatch` `claimDue` | `chat-widget` `chat.service` | `protocol` `lease` `conformance` |
| 典型结局 | 垂直 agent 服务 | 侧栏问答，写库不可靠 | 被别人嵌进产品 |

A 和 C 的缺口正好互补：A 有队列没有可嵌入的库，C 有可嵌入的库没有队列。

---

## 本仓选择

**C 的分层做骨，A 的队列作为其中一层库。** 不建 `examples/`，不建 B 的 `chat-widget` / `modules/chat`。

### 接法

任务是**意图**，会话是**执行记录**。认领一个到期任务就开一个 session —— 调度发起的 run 和人发起的 run 是同一种东西，同一种事件流，同一个查看器。

于是租约出现在两层，各管各的：

| 租约 | 管什么 | 冲突表现 |
| --- | --- | --- |
| 任务租约 | 谁来干（跨进程） | 重复认领 |
| 会话租约 | 谁在看 / 谁在改（跨客户端） | 并发写 |

HITL 因此不是新功能：人 attach 到调度发起的 session 上就能介入，这是会话租约的默认能力。

### 目录

```text
agent/
├── AGENTS.md
├── package.json                    # workspaces: packages/*
│
├── packages/
│   ├── telemetry/                  # 零依赖契约 + conformance
│   ├── ai/                         # 供应商统一层
│   │
│   ├── core/                       # agent 运行时（库）
│   │   └── src/
│   │       ├── loop.ts
│   │       ├── tools/              # 一文件一工具
│   │       ├── skills/             # markdown，按需读入
│   │       └── session/            # entry 树 + conformance
│   │
│   ├── protocol/                   # 帧 + schema；不依赖实现
│   ├── client/                     # 会话客户端；运行时中立
│   ├── server/                     # 会话服务器；transport 可插；不含业务
│   ├── session-backends/
│   │   ├── jsonl/                  # P0
│   │   └── sqlite/                 # P1
│   │
│   ├── queue/                      # ★ 唯一的 A 成分
│   │   └── src/
│   │       ├── task.ts             # { id, goal, runAt, leaseUntil, attempts }
│   │       ├── claim.ts            # claimDue；SKIP LOCKED
│   │       └── backoff.ts
│   │
│   ├── app/                        # 装配（bin）：实现 SessionService、起 server、起 dispatcher
│   └── evals/                      # 发布门禁
│
└── docs/
    ├── architecture.md
    └── boundaries.md               # 各包禁止事项清单
```

### 硬规则

1. `packages/queue` 不 import `core`。它只认任务行和租约，不知道认领之后要干什么。
2. 认领任务后必须开 session。不存在「只写日志不建会话」的后台执行。
3. 契约包依赖数趋零；每个可插点（backend / transport / telemetry）配 conformance。
4. `server` 不含业务；鉴权在 listener 里完成，进 server 的连接已经可信。
5. session append-only。压缩和分支是加节点，不是删历史。
6. 缺能力只减菜单，不抛错。工具报告观测来源，不报告 confidence。
7. 无 `examples/`：验证靠 test / eval。

### 产品完成线

| 阶段 | 必须能对外提供 |
| --- | --- |
| P0 | `core` 跑通一轮；JSONL session；`queue.claimDue`；一个投工入口 |
| P1 | `server` + `client` + 一种 transport；关掉客户端会话不停 |
| P2 | sqlite backend；HITL（attach 到调度发起的 session 介入）；conformance 齐 |
| P3 | 扩展分发（tool / skill 打包）；evals 当发布门禁；扇出 |

第一批对外接口（P0）：

```text
POST /v1/tasks                          别的系统投工
GET  /v1/sessions/:id/entries?since=    拉执行记录，entry id 当游标
GET  /health
```

`packages/queue` 预留蜂群缝（`TaskSpec` / `WorkerResult`），P0 只跑一个 worker，不实现扇出。
