# Agent

可部署的 Agent 后端。本文件落地 **四套对照目录**、本仓骨架、以及骨架上的 **两个方向**（V 垂直细分领域 / G 通用），用来定骨架，不写业务实现。

| 套    | 名称                 | 命题                                   |
| ----- | -------------------- | -------------------------------------- |
| **A** | 队列服务型           | Agent 是常驻服务；任务行是消息         |
| **B** | 传统 SaaS 外挂聊天框 | 业务系统是产品；聊天是侧栏功能         |
| **C** | 分层库 / harness     | Agent 是库；产品是装配它的那个包       |
| **D** | 全插件 harness       | 一切都是插件，loop 也是；产品是一份配置 |

本仓走 **C 的分层 + A 的队列层**。D 借两条规则（可插点三角色、模型可见 ⟺ 已记录），不借框架。B 只作反面参考，避免把 loop 塞进 CRUD 路由。方向未定：V 和 G 各给一套完整架构，选一个。

C、D 的参考仓有本地 checkout：`D:\sourcecode\pi`、`D:\sourcecode\deepseek-harness`。这两节的目录可以逐行对照，A、B 是归纳出来的骨架。

---

## 怎么读

先看 A / B / C / D 的差异，再看「本仓骨架」怎么把 A 的队列装进 C 的分层，最后在 V / G 两个方向里选一个——它们共用骨架，分歧在哪些包是产品、P0 先做哪半。

```text
A：人 / 别的系统 → API（只写任务行）→ 任务表 ←认领← Agent 进程（唯一智能）

B：人 → Web CRUD → API（领域逻辑 + 顺手调模型）
       ↘ ChatWidget → /api/chat（同进程、无队列、无独立部署）

C：宿主（CLI / 服务 / 别人的产品）→ 装配层 → agent 库
                                     ↘ server ←帧协议→ client（可断、可重连）

D：profile（有序 patch 层）→ 插件树 → 一切皆 ctx.<seam>，loop 也是插件
                                    ↘ webhook / schedule 直接开 session，不落任务行
```

四者不是好坏排序。A 回答「没人看着的时候谁在干活」，C 回答「智能怎么被复用和嵌入」，D 回答「智能的每一块怎么被整个替换」，B 三个都没回答。

贯穿全文的两个词：

- **投工**：别的系统把任务交给 Agent 然后走开，不等结果。落地就是写一行任务。
- **认领**（`claimDue`）：Agent 进程用租约从任务表取到期的行。`FOR UPDATE SKIP LOCKED`，多进程不重复。

---

## A — 队列服务型目录

参考系：[trycompai/crm](https://github.com/trycompai/crm)、[simieco/simie](https://github.com/simieco/simie)。目录是从这类仓库归纳的骨架，不逐行对应。

### 形态

```text
apps/web          体验：会话、任务列表、run 时间线
apps/api          薄壳：鉴权、入队、查 run；不调模型、不 enrich
apps/agent        唯一智能进程：对话 loop + claimDue
packages/*        契约与数据，不含编排
```

关浏览器之后 `apps/agent` 仍认领队列。API 入队后至多 poke 一下 agent 进程（通知，不 await 结果，丢了也没事）；**任务行才是消息**。

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
│   │       ├── tasks.ts           # POST /v1/tasks（投工）  GET /v1/tasks/:id
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

| 层          | 落点                              | 不做什么              |
| ----------- | --------------------------------- | --------------------- |
| 体验        | `apps/web`                        | 不跑 loop、不调供应商 |
| 控制 / 入队 | `apps/api`                        | 不 enrich、不打分     |
| 编排        | `apps/agent/src/graph.ts`         | 不直连 UI             |
| 工具 / 技能 | `apps/agent/src/tools` `skills`   | 不报自信分，只报观测  |
| 数据        | `packages/db`                     | 不藏业务智能          |
| 质量        | `apps/agent/evals`                | 不靠肉眼当回归        |

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

### 形态

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

参考系：[earendil-works/pi](https://github.com/earendil-works/pi)。目录直接对照 pi 的实际结构，可以逐行读。

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
│   ├── server/                     # 会话服务器；listener、transports/unix/、testing/
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

| 层          | 落点                                         | 不做什么                           |
| ----------- | -------------------------------------------- | ---------------------------------- |
| 契约        | `telemetry` `protocol`                       | 不依赖实现；依赖数趋零             |
| 供应商      | `ai`                                         | 不知道 agent 存在                  |
| 编排        | `agent`（库）                                | 不选传输、不管进程形态             |
| 工具 / 技能 | `agent/harness/tools` `skills.ts`            | 一文件一工具                       |
| 状态        | `agent/harness/session` + `session-backends` | append-only；不改历史              |
| 传输        | `protocol` `client` `server`                 | `server` 不含业务；鉴权归 listener |
| 产品        | `coding-agent`                               | 唯一知道「全都有谁」的地方         |
| 质量        | `evals` + 各包 `testing/conformance`         | 插件靠 conformance 不漂            |

### 三个关键设计

**session 是 append-only 的 entry 树。** entry id 稳定，所以能当游标：`get_entries --since <id>` 跨重启续读。默认落 JSONL，后端可换。压缩、fork、clone 都是往树上加节点，不删历史。

**「关客户端还能跑」靠租约，不靠队列。** session 活在 server 侧，client `detach` 后服务端不停，另一个 client `attach` 回来靠 snapshot 对齐。exclusive / shared 两种租约防并发写。注意这解决的是「多端接同一个会话」，**不是**「没人看着时自己找活干」。

**领域对象和线上 DTO 互不认识。** `ai` 的类型和 `protocol` 的 DTO 是两套，转换职责显式归 `server` 包持有，用编译期字段清单强制「`ai` 加字段必须过一次 review」。

### 硬规则

1. 契约包依赖数趋零。`telemetry` 零依赖，`protocol` 只依赖校验库。
2. 每个可插点配一套 conformance 测试，否则不许可插。
3. agent 是库；进程形态由 `server` / `client` 决定。
4. session append-only；entry id 稳定，可当跨重启游标。
5. 运行时中立：包的 root 入口不 import node 内建模块；node 专属能力走子路径导出。
6. 依赖精确 pin，lockfile 提交要闸门。

### C 的盲区

**没有队列，没有定时，没有无人值守。** 所有 run 都由某个客户端发起。要「凌晨三点自己去查一遍」，这套里没有现成的东西。

---

## D — 全插件 harness 目录

参考系：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）。框架是 [Cordis](https://github.com/cordiverse/cordis)：插件向共享 `ctx` 贡献服务、类型化事件和可撤销的副作用。50 个包组、249 个包，全部 `@deepseek-ai/dsh-*`。

### 形态

**没有特权 core。** 模型适配器、tool 注册表、session log、agent loop 本身都是插件，都能从配置替换。产品不是「带 `bin` 的包」，是一份叠加出来的配置（profile）：`dsh --profile web --dump-config` 打印出来的每一行都能被上一层 patch 替换。

```text
profile（bundle patch 按序叠加 → profile 自己的 patch → home 级 → --patch）
  → Cordis 插件树 → ctx.<seam>：Service Definition / Provider / Consumer
                  ↘ core/agent-loop 也只是树上一个插件，可换

宿主：dsh web（浏览器 GUI）/ headless（一次性）/ sdk（JSON-RPC stdio）/ acp
```

C 把「谁来常驻」交给 `server` / `client` 两个包；D 把它交给 profile：同一棵树，换一层 patch 就从浏览器 GUI 变成 stdio server。

### 目录

```text
deepseek-harness/
├── AGENTS.md                       # 开发纪律；packages/ 和部分组下再各有一份；每包有固定章节的 README
├── pnpm-workspace.yaml             # vendor/*  packages/*/*  apps/*  native/  python/
├── vendor/                         # 钉版本的 Cordis 源码（框架本体）
│
├── packages/<group>/<pkg>/
│   ├── core/                       # 脊柱：session / system-prompt / tools / agent / agent-loop / scope
│   │   ├── agent/                  #   Agent 接口 + 注册表 + agent/* 事件（ctx.agents）
│   │   └── agent-loop/             #   默认 loop 驱动（ctx.agentLoop）；扩展不许依赖它
│   ├── llm/                        # ctx.llm 契约 + llm-deepseek / llm-pi-ai（← 依赖 pi 的 ai 包）
│   ├── session/                    # session-persistence 契约 + jsonl 后端；projection / title / telemetry
│   ├── session-query/              # 读侧：sqlite 全文索引。不是写后端
│   │
│   ├── shell/                      # 每个能力都是三件套：
│   │   ├── shell/                  #   Service Definition（抽象类，ctx.shell）
│   │   ├── bash-local/  bash-sandbox/  pwsh-local/   # Providers
│   │   └── tool-bash/              #   Consumer（模型可见的 tool）
│   ├── subprocess/  fs/  terminal/  sandbox/  lsp/  web/  skill/  compaction/  subagent/   # 同上
│   ├── hooks/  mcp/  context/      # Claude Code / Codex hook 桥；MCP client；请求上下文
│   │
│   ├── webhook/                    # 外部事件 → 直接开 session；fire-and-forget
│   ├── schedule/                   # 会话内定时提醒；会话必须活着
│   ├── jobs/                       # 会话内后台任务注册表（bash 后台、subagent）
│   ├── goal/                       # 同会话持久目标 + 轮次上限
│   ├── workflow/                   # worker-thread 脚本引擎；workflow / ralph tool
│   │
│   ├── interaction/                # approval / ask-user / commands / permission-presets
│   ├── sdk/                        # JSON-RPC over stdio：protocol / client / server
│   ├── acp/                        # Agent Client Protocol server
│   ├── api/  host/  client/        # Web GUI：RPC 网关 / HTTP 宿主 / 浏览器端 ui-* 插件
│   ├── typert/                     # 类型图生成 + 运行时注册表；RPC 的类型来源
│   │
│   ├── bundle/                     # ★ 产品 = patch 层：base / web-app / headless / sdk-app / sdk-minimal / acp-app
│   ├── boot/  preset/  settings/  credentials/  storage/  workspace/  identity/
│   ├── guard/  spill/  attachment/  todo/  plan/  feedback/  extensions/
│   └── test-support/  runtime-diagnostics/  util/  experimental/  e2b/
│
├── apps/
│   ├── cli/                        # 唯一 bin：dsh --profile <name>；config/examples/ 放可选 overlay
│   └── web/                        # Vite 前端
├── python/                         # Python SDK；同一份 JSON-RPC 协议；wheel 里打包 dsh 本体
├── native/landlock-run/            # Linux Landlock 沙箱启动器
├── snapshots/                      # 无 key 的录制会话回放，当门禁
├── docs/                           # architecture / subsystems/* / 生成目录：capability-seams、tool-catalog、config-catalog
└── .agents/notes/                  # 每个非平凡改动一篇决策记录
```

### 层 → 目录

| 层     | 落点                                                             | 不做什么                                             |
| ------ | ---------------------------------------------------------------- | ---------------------------------------------------- |
| 框架   | `vendor/`（Cordis）                                              | 不含业务；钉版本                                     |
| 契约   | 每个 seam 的 Service Definition 包（`shell/shell` `fs/fs` `llm/llm`） | 不含实现；是抽象类或注册表类，不是 `interface`   |
| 供应商 | `llm/llm-deepseek` `llm/llm-pi-ai`                               | 不知道 loop 存在                                     |
| 编排   | `core/agent-loop`                                                | 可换；扩展只依赖 `core/agent` 的事件和服务           |
| 工具   | 各 seam 的 `tool-*` 包                                           | 只消费 seam；不自己 spawn、不自己读盘                |
| 状态   | `core/session` + `session/session-persistence(-jsonl)`           | append-only；进模型的必须能从 log 重建               |
| 传输   | `sdk/*` `acp/` `api/` `host/`                                    | 不含业务                                             |
| 产品   | `bundle/*` + `apps/cli`                                          | bundle 只是 patch 层；`apps/cli` 是唯一 bin          |
| 质量   | `snapshots/` + 每包 invariant + 生成文档新鲜度门禁               | 不靠肉眼；覆盖率门禁 100%                            |

### 三个关键设计

**可插点是三角色，缺一个不算。** Service Definition（`ctx.<key>` 的抽象类）/ Service Provider / Consumer。`shell/shell` 定义 → `bash-local` / `bash-sandbox` / `pwsh-local` 实现 → `tool-bash` 消费；换沙箱不改 tool。fs 与 subprocess 共用一个执行世界，指到远端沙箱（`e2b/`）时 bash / PTY / LSP 一起过去，不需要各 fork 一份。

**事件分三域，且「模型可见 ⟺ 已记录」。** session 事件（durable，落 log）/ agent 事件（live，`agent/pre-step` 等 waterfall 可拦截改写）/ capability 事件（`fs/*` `tools/*`，不 import loop）。硬约束：任何进入模型请求的东西都必须能从 session log 重建，新增一种模型可见输入 = 新增一种 session 事件；有运行时 invariant 守着。

**产品是配置，不是包。** profile = 按 `dsh.profile.bundles` 顺序叠加各 bundle 的 `cordis.patch.yml`，再叠 profile 自己的、home 级的、`--patch` 的。`web` / `headless` / `sdk` / `sdk-minimal` / `acp` 五个 profile 共用 `bundle/base`。patch 按 id 替换整行配置，所以换 loop 和换模型是同一种操作。

### D 怎么回答「没人看着」

四个包沾边，都停在**认领**之前：

| 包         | 做什么                                                                                       | 不做什么                                               |
| ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `webhook`  | 验签的外部事件 → 可信规则 → 直接开一个 Workspace session，投第一条 user message；GitHub 适配器 202 即返回 | 无队列、无重试、无去重、无执行状态；重复投递就重复开会话 |
| `schedule` | 会话内 `after` / `at` / `every`（≥ 5 分钟）提醒，作为后续 turn 回到原会话；落 `schedule/change` 事件可重放 | 会话必须活着；没有冷会话调度器；at-least-once           |
| `jobs`     | 会话内后台任务注册表（bash 后台、subagent），`job_*` tool 读 / 等 / 杀                        | 进程内；归属某个 agent，agent 销毁就取消               |
| `goal`     | 同会话持久目标，`active / paused / blocked / complete`，按轮次续跑                            | 是状态不是调度器；不开新会话                           |

用本文的两个词：D 有**投工**（webhook 就是投工，只是不落任务行，直接开 session），没有**认领**——没有任务行、没有租约、没有重试、没有跨进程。

### 硬规则

1. 一切都是插件，包括 loop。新行为挂在文档化的扩展点上；改 loop 要同步改 `architecture.md`。
2. 注册即副作用：所有贡献走 `ctx.effect()` / `ctx.on()`，插件卸载自动回收。
3. 扩展只依赖 Service Definition，不依赖具体 provider。`agent-loop` 是 provider，可换。
4. 模型可见 ⟺ 已记录。
5. 插件里不许硬编码可调参数；部署会变的都是 `Config` 字段，可从 `cordis.yml` 改。
6. 每个非平凡改动一篇决策记录；每包 README 固定章节；生成文档有新鲜度门禁。
7. 预发布期不留兼容层：`SESSION_FORMAT_VERSION = 0`，后端拒读旧格式。

### D 的盲区

**代价是框架。** 249 个包，每包 README / invariant / 门禁，一切经 Cordis 容器；不带 Cordis 就用不了任何一块。「换一行配置换掉 loop」服务的是要在自己产品里深度改装的人，不是要嵌一个 loop 的人。

**和 C 一样没有认领。** webhook 是 fire-and-forget，schedule 只在活会话里，jobs 是进程内。

### C 与 D 的关系

D 的 `llm/llm-pi-ai` 直接依赖 pi 的 `@earendil-works/pi-ai`：C 的 `ai` 层被另一个 harness 拿去当供应商适配器。「`ai` 不知道 agent 存在」这条边界确实能独立复用，本仓的 `ai` 包照此切。

---

## 对照

|          | A 队列服务            | B 外挂聊天框                 | C 分层库                             | D 全插件 harness                                         |
| -------- | --------------------- | ---------------------------- | ------------------------------------ | -------------------------------------------------------- |
| 产品中心 | run / 任务            | 联系人 / 订单表单            | 包与会话                             | profile（一份配置）                                      |
| 智能形态 | 常驻进程              | HTTP 请求内                  | 可嵌入的库                           | 插件树里的一个可换插件                                   |
| 部署单元 | `apps/agent`          | 单体                         | 带 `bin` 的包 + 可选 server          | 单 bin `dsh --profile <name>`                            |
| 接缝     | HTTP + 队列表         | 函数调用                     | 帧协议（CBOR）                       | 进程内 `ctx.<seam>` + 三域事件；对外 JSON-RPC / ACP      |
| 关客户端 | 队列继续              | 停止                         | server 侧 session 继续，可重连       | web：本机 server 活着就继续；sdk / acp：stdio 断开即停   |
| 无人值守 | 有（`claimDue`）      | 无                           | 无                                   | 半个：webhook 投工、schedule 会话内定时；无认领          |
| 状态     | task / run / event    | `messages[]`                 | append-only entry 树                 | append-only 事件 log；模型可见 ⟺ 已记录                  |
| 可插点   | 工具                  | 无                           | 传输 / 后端 / 扩展，各带 conformance | 一切；seam 三角色 + 运行时 invariant                     |
| 质量     | evals 门禁            | 无                           | evals + conformance                  | 录制回放 snapshots + 100% 覆盖 + 生成文档门禁            |
| 目录信号 | `dispatch` `claimDue` | `chat-widget` `chat.service` | `protocol` `transports` `conformance` | `cordis.patch.yml` `bundle/` `<seam>/` + `-local` + `tool-` |
| 典型结局 | 垂直 agent 服务       | 侧栏问答，写库不可靠         | 被别人嵌进产品                       | 被别人当平台改装                                         |

缺口互补：A 有队列没有可嵌入的运行时；C、D 有可嵌入 / 可改装的运行时，没有队列。D 比 C 多走了半步（webhook 投工），停在认领之前。

---

## 本仓骨架

**C 的分层做骨，A 的队列作为其中一层库。** 不建 `examples/`，不建 B 的 `chat-widget` / `modules/chat`。

从 D 借两条规则，不借框架：

- **可插点 = 三角色。** `session-backends/*`、`server` 的 transport、telemetry 都按「契约包 / 实现包 / 消费者」摆，conformance 挂在契约包。少一角就不算可插点，只是内部实现。
- **模型可见 ⟺ 已记录。** 进 loop 请求的任何东西都必须能从 entries 重建；`core` 里加一种模型可见输入 = 加一种 entry 类型。

不借 Cordis：骨架十来个包，固定分层比容器便宜。本仓要的是「任务行 + 租约」；D 有 249 个插件仍停在认领之前，说明这一层要专门做，插件框架不会替你做。

骨架不选方向。它回答「包怎么切、边界在哪」；「哪些包是产品、`tools/` 装什么、evals 测什么、P0 先做哪半」由方向回答，见后面 V / G 两节。

### 接法

任务是**意图**，会话是**执行记录**。认领一个到期任务就开一个 session —— 调度开的会话和人开的会话是同一种东西，同一条事件流，同一个查看器。

```text
调度：任务表 ←claimDue← dispatcher → 开 session → core loop → entries（append-only）
人  ：client attach → 同一个 session → 同一条 entries
```

于是租约出现在两层，各管各的：

| 租约     | 管什么                      | 冲突表现 |
| -------- | --------------------------- | -------- |
| 任务租约 | 谁来干（跨进程）            | 重复认领 |
| 会话租约 | 谁在看 / 谁在改（跨客户端） | 并发写   |

HITL 因此不是新功能：人 attach 到调度开的 session 上就能介入，这是会话租约的默认能力。

### 目录

```text
agent/
├── AGENTS.md                       # 边界 + 开发纪律：智能只在 core，装配只在 app
├── package.json                    # workspaces: packages/*  packages/session-backends/*
│
├── packages/
│   ├── telemetry/                  # 零依赖契约 + conformance
│   ├── ai/                         # 供应商统一层；不知道 agent 存在
│   │
│   ├── core/                       # agent 运行时（库）
│   │   └── src/
│   │       ├── loop.ts
│   │       ├── capabilities.ts     # 缺 key 只减菜单，不抛错
│   │       ├── tools/              # 一文件一工具 + schema + 副作用说明
│   │       ├── skills/             # markdown，按需读入
│   │       └── session/            # entry 树 + conformance
│   │
│   ├── protocol/                   # 帧 + schema；不依赖实现
│   ├── client/                     # 会话客户端；运行时中立
│   ├── server/                     # 会话服务器；transport 可插；不含业务
│   ├── session-backends/
│   │   ├── jsonl/                  # 默认
│   │   └── sqlite/                 # 可换
│   │
│   ├── queue/                      # ★ 唯一的 A 成分；不 import core
│   │   └── src/
│   │       ├── task.ts             # { id, spec: TaskSpec, runAt, leaseUntil, attempts }
│   │       ├── claim.ts            # claimDue；SKIP LOCKED
│   │       └── backoff.ts
│   │
│   ├── app/                        # 装配（bin）。唯一知道「全都有谁」的包
│   │   └── src/
│   │       ├── http/               # 投工 / 读 entries 的薄壳；有 queue 才有
│   │       ├── dispatcher.ts       # claimDue → 开 session → 跑 core；只租约到期行，不决策
│   │       ├── session-service.ts  # 实现 server 需要的 SessionService
│   │       └── main.ts             # 起 http / dispatcher / server；起哪些由方向决定
│   │
│   └── evals/                      # 发布门禁
│
└── docs/
    ├── architecture.md
    └── boundaries.md               # 各包禁止事项清单
```

### 层 → 目录

| 层          | 落点                                    | 不做什么                                 |
| ----------- | --------------------------------------- | ---------------------------------------- |
| 契约        | `telemetry` `protocol`                  | 依赖数趋零                               |
| 供应商      | `ai`                                    | 不知道 agent 存在                        |
| 编排        | `core`                                  | 不选传输、不碰任务表                     |
| 工具 / 技能 | `core/src/tools` `skills`               | 一文件一工具；只报观测，不报 confidence  |
| 状态        | `core/src/session` + `session-backends` | append-only；不改历史                    |
| 传输        | `protocol` `client` `server`            | `server` 不含业务；鉴权归 listener       |
| 队列        | `queue`                                 | 不 import `core`；不知道认领之后要干什么 |
| 装配 / 入口 | `app`                                   | HTTP 只写任务行、只读 entries，不驮 loop |
| 质量        | `evals` + 各包 `testing/conformance`    | 不靠肉眼当回归                           |

### 硬规则

1. `packages/queue` 不 import `core`。它只认任务行和租约，不知道认领之后要干什么；接线在 `app/src/dispatcher.ts`。
2. 认领任务后必须开 session。不存在「只写日志不建会话」的后台执行。
3. 任何 HTTP 入口都是薄壳：只写任务行、只读 entries。loop 不跑在请求里——这是 B 的错。
4. 契约包依赖数趋零；每个可插点（backend / transport / telemetry）契约 / 实现 / 消费者三角色齐全，conformance 挂在契约包。
5. `server` 不含业务；鉴权在 listener 里完成，进 server 的连接已经可信。
6. session append-only。压缩和分支是加节点，不是删历史。模型可见 ⟺ 已记录：进 loop 请求的都能从 entries 重建。
7. 缺能力只减菜单，不抛错。工具报告观测来源，不报告 confidence。
8. 无 `examples/`：验证靠 test / eval。

`packages/queue` 预留多 worker 扇出的接缝（`TaskSpec` / `WorkerResult`），起步只跑一个 worker，不实现扇出。`TaskSpec` 长什么样由方向决定。

---

## 方向 V — 垂直细分领域 Agent

参考系：A 的两个仓库（crm、simie）就是这个方向。D 的 `webhook-github` 是同一命题的无队列版——外部事件直接开 session，不落任务行；本方向要落。命题：**产品是「某个领域里没人看着也在干活的服务」。** 买的人是业务方，投工的是别的系统和定时器，人偶尔进来看和介入。

### 形态

```text
别的系统 / 定时 → app/http（投工）→ 任务表 ←claimDue← dispatcher → core loop（装了领域 tools / skills）→ entries
业务方           → web：看 entries、按钮介入（普通 HTTP，不需要帧协议）
```

护城河不在 `core`，在领域包：任务类型、领域工具、领域 SOP、领域 eval。`core` 在这个方向里是可替换的零件。

### 目录

```text
agent/
├── packages/
│   ├── telemetry/  ai/  core/      # 同骨架；core 不含领域词汇
│   ├── queue/                      # 同骨架；本方向的脊柱
│   ├── session-backends/           # jsonl 默认；sqlite 跟 web 一起来
│   ├── protocol/  client/  server/ # 后置：第二个宿主出现再建（P3）
│   │
│   ├── <domain>/                   # ★ 领域包：护城河（例：crm）
│   │   └── src/
│   │       ├── tasks/              # 一文件一任务类型：目标模板、可用工具、完成判据
│   │       │   └── followup-before-expiry.ts
│   │       ├── tools/              # 领域动作；副作用声明必填：读 / 写 / 不可逆
│   │       ├── skills/             # 领域 SOP，markdown
│   │       ├── schedules.ts        # 哪些任务类型定期投、什么频率
│   │       └── evals/              # 一任务类型至少一条；测结果，不测措辞
│   │
│   ├── integrations/               # 外部系统适配：CRM / 邮箱 / IM / 日历
│   │   └── <vendor>/               # 只是 API client；不知道 LLM 存在；缺 key 只减菜单
│   │
│   ├── app/                        # 装配（bin）。唯一 import <domain> 的地方
│   │   └── src/
│   │       ├── http/               # POST /v1/tasks  GET …/entries  POST …/input  GET /health
│   │       ├── dispatcher.ts       # claimDue → 按 task.type 取任务定义 → 开 session → 跑 core
│   │       └── main.ts             # 起 http + dispatcher + schedules
│   │
│   ├── web/                        # 任务列表、entries 时间线、介入按钮；不跑 loop
│   └── evals/                      # 门禁：跑 <domain>/evals
│
└── docs/
```

### 层 → 目录

其余层同骨架，只列新增和改变的：

| 层          | 落点                                               | 不做什么                                       |
| ----------- | -------------------------------------------------- | ---------------------------------------------- |
| 编排        | `core`                                             | 不含领域词汇；不知道「线索」「合同」是什么     |
| 领域        | `<domain>`：tasks / tools / skills / schedules / evals | 不 import `queue`、不碰进程；只被 `app` 装配 |
| 外部系统    | `integrations/<vendor>`                            | 不知道 LLM 存在；不出现在 prompt 里            |
| 装配 / 入口 | `app`                                              | HTTP 只写任务行、只读 entries、只投 input      |
| 体验        | `web`                                              | 只读 + 介入；不长 CRUD                         |
| 质量        | `evals` → `<domain>/evals`                         | 测领域结果（写对了没有），不测「回答像不像」   |

### 硬规则（叠加在骨架之上）

1. `core` 不含领域。领域词汇只出现在 `<domain>` 和 `integrations`；CI 用 grep 守门。
2. 领域 tool 碰外部系统必须经 `integrations`，不在 tool 里拼 HTTP / SQL。tool 负责 schema 和副作用声明，integration 负责调用。
3. 副作用声明必填：读 / 写 / 不可逆。不可逆动作默认停下等 approve，除非该任务类型显式放行。
4. 一个任务类型至少一条 eval；没有 eval 的任务类型不许进 `schedules`。
5. `web` 只读 entries + 投 input。任何 CRUD 需求长在业务方自己的系统里，不长在这里——这是 B 的防线。
6. 没有「随便问点什么」的入口。入口是任务类型，不是聊天框。

### 产品完成线

| 阶段 | 必须能对外提供                                                                       |
| ---- | ------------------------------------------------------------------------------------ |
| P0   | `core` 跑通一轮；JSONL session；`claimDue`；HTTP 投工；**一种**任务类型端到端 + 它的 eval |
| P1   | `web` 看 entries + 介入；`schedules` 定时投工；不可逆动作 approve；sqlite            |
| P2   | 第二、三种任务类型；第二家 `integrations`；evals 当发布门禁；backend / telemetry conformance 齐 |
| P3   | 多 worker 扇出；第二个宿主（嵌进客户产品）出现时再建 `protocol` / `server` / `client` |

第一批对外接口（P0）：

```text
POST /v1/tasks                          投工：{ type, payload, runAt? }
GET  /v1/sessions/:id/entries?since=    拉执行记录，entry id 当游标
POST /v1/sessions/:id/input             人介入：approve / 补信息 / 叫停
GET  /health
```

这几条走 `app/src/http` 的普通 HTTP，直接读写任务表和 session 后端，不经过帧协议。`TaskSpec` 在这个方向里就是 `{ type, payload }`，`type` 对应 `<domain>/src/tasks/` 里的一个文件。

### V 的失败模式

- **长成 B。** 客户要 dashboard，`web` 里长出表单，`app/http` 里长出 CRUD。守住规则 5。
- **领域泄进 `core`。** 某个 prompt 模板里出现「线索」。守住规则 1。
- **换领域要重写 `<domain>`。** 这是代价，不是 bug；`core` 不用改就是骨架的回报。

---

## 方向 G — 通用 Agent

参考系：C 的 pi 和 D 的 dsh 都是这个方向。命题：**产品是「可嵌入、可远程、可扩展的 agent 运行时」。** 买的人是开发者，把它嵌进自己的产品或直接用 CLI。相对 pi / dsh 的差异只有一处：把 A 的队列做进 harness。pi 没有投工也没有认领；dsh 有投工（webhook）没有认领。

### 形态

```text
开发者   → CLI（app）→ core → 本机 session
开发者   → client ←帧协议→ server → core → server 侧 session（可断、可重连）
别的系统 → POST /v1/tasks → 任务表 ←claimDue← dispatcher → 同一种 session      ← pi 没有、dsh 只有前半的那一层
```

护城河在契约的稳定性：protocol、extension-api、session 格式。别人嵌了你就不能随便改。

### 目录

```text
agent/
├── packages/
│   ├── telemetry/  ai/             # 同骨架
│   ├── tui/                        # 终端 UI；与 core 无关（对应 pi/tui）
│   │
│   ├── core/                       # ★ 运行时（库）
│   │   └── src/
│   │       ├── loop.ts
│   │       ├── capabilities.ts
│   │       ├── tools/              # 只有通用五件：bash / read / write / edit / fetch
│   │       ├── skills/
│   │       ├── compaction/         # 上下文压缩 + 分支摘要
│   │       └── session/            # entry 树 + conformance
│   │
│   ├── extension-api/              # ★ 契约：第三方 tool / skill / hook 的接口 + conformance（对应 dsh 的 Service Definition 包）
│   ├── protocol/                   # ★ 帧 + schema；加字段走版本
│   ├── client/                     # ★ 运行时中立；root 无 node import
│   ├── server/                     # ★ transports/unix/ 起步；testing/
│   ├── session-backends/
│   │   ├── jsonl/                  # 默认
│   │   └── sqlite/
│   │
│   ├── queue/                      # 可选层。不装也能完整用 core + server + client
│   │
│   ├── app/                        # 参考 CLI（bin）。对应 pi/coding-agent；也是唯一的「example」
│   │   └── src/
│   │       ├── modes/              # interactive（TUI）/ print / rpc（JSONL over stdio）/ serve
│   │       ├── extensions/         # 加载第三方扩展
│   │       ├── dispatcher.ts       # 仅 serve 且装了 queue 时启用
│   │       └── main.ts
│   │
│   └── evals/                      # 通用能力基准 + 各契约 conformance
│
└── docs/
    ├── embedding.md                # 给嵌入者：怎么起 server、怎么接 client
    ├── protocol.md                 # 帧格式、版本策略
    └── why-not-pi.md               # 对 pi 和 dsh 都要能答；写不出来就停
```

### 层 → 目录

其余层同骨架，只列新增和改变的：

| 层     | 落点                                   | 不做什么                                             |
| ------ | -------------------------------------- | ---------------------------------------------------- |
| 契约   | `telemetry` `protocol` `extension-api` | 依赖数趋零；三个都配 conformance；加字段走版本       |
| 编排   | `core`                                 | tools 只有通用五件；任何领域动作走 extension         |
| 传输   | `protocol` `client` `server`           | 同骨架；但在这里是产品，不是配件                     |
| 队列   | `queue`                                | 可选依赖；`core` / `server` / `client` 不 import 它  |
| 扩展   | `extension-api` + 第三方包             | 过 conformance 才算扩展                              |
| 产品   | `app`                                  | 唯一装配点；四种 mode 共用一个 core                  |
| 质量   | `evals` + 各契约 conformance           | 通用基准；契约变更必须过 conformance                 |

### 硬规则（叠加在骨架之上）

1. `core` 的 tools 只有通用五件。领域动作一律走 `extension-api`，包括你自己写的。
2. 每个对外契约（protocol / extension-api / telemetry / session backend）先写 conformance 再写实现。
3. 兼容性是产品：protocol 加字段走版本号；entry 格式只增不改；破坏性变更走 major。
4. `queue` 是可选依赖。不装 queue 的宿主拿到的是完整产品，不是残缺版。
5. `app` 是唯一的参考实现。不建第二个 example，不建 demo 仓。
6. `docs/why-not-pi.md` 必须存在且能说服一个正在用 pi 或 dsh 的人。写不出来，方向不成立。

### 产品完成线

| 阶段 | 必须能对外提供                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------- |
| P0   | `core` + JSONL；`protocol` + `server` + `client` + unix transport；CLI 三模式（interactive / print / rpc）；session conformance |
| P1   | attach / detach、会话租约、snapshot 对齐；sqlite；`extension-api` + 第一个第三方扩展过 conformance |
| P2   | `queue` 作为可选层接入 serve 模式：`POST /v1/tasks` 投工进 server；evals 当门禁                    |
| P3   | 第二种 transport（tcp / ws）；扩展分发；多 worker                                                  |

第一批对外接口（P0）——帧协议消息，不是 HTTP：

```text
create / attach / detach                会话生命周期；detach 后 server 不停
input                                   人或程序的输入
get_entries --since <id>                entry id 当游标，跨重启续读
lease exclusive | shared                多端并发写保护
```

CLI 四种 mode：

```text
agent                       interactive：TUI
agent -p "…"                print：跑一轮，stdout 出结果
agent --rpc                 JSONL over stdio：给别人的产品嵌（对应 pi rpc mode / dsh sdk profile）
agent --serve unix:…        起 server；装了 queue 则同时起 dispatcher
```

`TaskSpec` 在这个方向里是 `{ goal, cwd?, tools? }`——自由目标，不是任务类型。

### G 的失败模式

- **做成更差的 pi / dsh。** 唯一的差异是 queue；先问「pi + 一个扩展 + 一个 cron」能不能做到，再问「dsh + webhook + schedule」为什么不够。第二个问题的答案只能是认领——租约、重试、跨进程——不能是别的。
- **没有客户。** 通用运行时卖给开发者靠生态，生态靠契约稳定；契约变一次，扩展死一批。
- **「无 `examples/`」承压。** 想建 demo 的冲动说明 `app` 没做好参考实现的角色。

---

## 方向对照

|                              | V 垂直细分领域                  | G 通用                                                      |
| ---------------------------- | ------------------------------- | ----------------------------------------------------------- |
| 产品                         | `app` + `<domain>`              | `core` + `protocol` + `server` + `client` + `extension-api` |
| 买家                         | 业务方                          | 开发者                                                      |
| 谁投工                       | 别的系统、定时；人偶尔介入      | 人（client）；队列可选                                      |
| `queue`                      | 脊柱                            | 可选层、唯一差异点                                          |
| `tools/`                     | 领域动作，副作用声明必填        | 通用五件                                                    |
| `skills/`                    | 领域 SOP                        | 通用；领域的走 extension                                    |
| HITL                         | `web` 看 entries + HTTP input   | attach / 会话租约                                           |
| `server` `client` `protocol` | P3                              | P0                                                          |
| `TaskSpec`                   | `{ type, payload }`             | `{ goal, cwd?, tools? }`                                    |
| evals 测什么                 | 领域结果：写对了没有            | 通用基准 + 契约 conformance                                 |
| 领域住哪                     | `<domain>` `integrations`       | 不存在；走 extension                                        |
| 护城河                       | 任务类型 + 领域 eval            | 契约稳定性 + 生态                                           |
| 直接对手                     | 同领域的 B 型产品               | pi / dsh / Claude Code / Codex CLI                          |
| 典型失败                     | 长成 B                          | 更差的 pi / dsh                                             |
| 参考系                       | A（crm、simie）                 | C（pi）、D（dsh）                                           |

两个方向共用骨架，`core` 在两边都无领域。差别是 `<domain>` 包存在不存在、`server` 是 P0 还是 P3。不选就是两头都做：通用骨架永远没有客户，垂直产品永远不干净。

强制收敛的检验：**第一条 eval 写什么。** 「合同到期前 7 天正确创建跟进任务」是 V；「在陌生仓库里改对一个函数」是 G。
