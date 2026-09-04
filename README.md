# Agent

可部署的 Agent 后端。本文件按 **Agent 类型** 切分：每一类一张产品简笔画、一张流程图、一套架构目录、一组硬规则。用来定骨架，不写业务实现。

| 类型         | 命题                                   | 买家             | 参考系                                                                                                    |
| ------------ | -------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| **垂直类**   | 某个领域里没人看着也在干活的服务       | 业务方           | [crm](https://github.com/trycompai/crm)、[simie](https://github.com/simieco/simie)                        |
| **通用类**   | 可嵌入、可远程、可扩展的 agent 运行时  | 开发者           | [pi](https://github.com/earendil-works/pi)、[dsh](https://github.com/deepseek-ai/deepseek-harness)        |
| **助手类**   | 已有产品角落里的聊天框                 | 已有产品的用户   | 多数「AI CRM / AI 后台」                                                                                  |
| **工作流类** | 人画好的图，LLM 只在节点里填空         | 流程负责人       | Dify、n8n、LangGraph                                                                                      |
| **多 Agent** | 编排者拆活，多个角色协作出一份产物     | 研究 / 生成类需求 | deep research、dsh `subagent/`、Claude Code subagent                                                      |

类型由三个问题定：**谁驱动**（人 / 别的系统 / 定时）、**智能住哪**（独立进程 / 库 / 业务进程 / 节点 / 多个）、**关掉页面还干不干活**。五类不是好坏排序，是五种不同的产品；目录长得不一样，所以分开写。工作流和多 Agent 也常作为前三类**内部**的组织方式，这里单列是因为它们自成产品时目录自成一套。

pi、dsh 有本地 checkout：`D:\sourcecode\pi`、`D:\sourcecode\deepseek-harness`，通用类那节的目录可以逐行对照。其余参考系是归纳出来的骨架。

类型由产品定，不由本仓预选。怎么拿需求文档判型、已判型的产品落在哪，见文末。

---

## 怎么读

每一类固定几节：命题与参考系、产品简笔画、流程图、目录、层 → 目录、硬规则、失败模式；垂直类、通用类、助手类多一节完成线。看完五类看「对照」，最后看「按产品判型」。

两张图各答一个问题：

- **产品简笔画**：买家打开产品看到的第一屏。线框，不是 UI 稿；画的是「这类产品长什么样」，用来一眼分辨类型。
- **流程图**：一次运行从触发到结束走的路。`◇` 是分叉，`◀──┐` 是回头；人出现在哪一格，就是这类产品的人机接触点。

贯穿全文的两个词：

- **投工**：别的系统把任务交给 Agent 然后走开，不等结果。落地就是写一行任务。
- **认领**（`claimDue`）：Agent 进程用租约从任务表取到期的行。`FOR UPDATE SKIP LOCKED`，多进程不重复。

五类里只有垂直类两个都有。通用类把认领做成可选层；助手类、工作流类、多 Agent 都停在认领之前。

---

## 垂直类 Agent

**命题：产品是「某个领域里没人看着也在干活的服务」。** 买的人是业务方；投工的是别的系统和定时器；人偶尔进来看和介入。入口是任务类型，不是聊天框。护城河不在运行时，在领域包：任务类型、领域工具、领域 SOP、领域 eval。运行时是可替换的零件。

参考系：[trycompai/crm](https://github.com/trycompai/crm)、[simieco/simie](https://github.com/simieco/simie)。两个仓都是 `apps/web` + `apps/api` + `apps/agent` 三个部署单元：api 只写 `AgentTask` 行，至多 poke 一下 agent（通知，不 await，丢了也没事）；agent 独立部署，`claimDue` 认领；web 只看。**任务行才是消息。** 下面的目录把这三块换成包，边界不变。

### 产品简笔画

```text
┌─ crm-agent（web） ─────────────┬─ 会话 a1f3 · followup-before-expiry ─────┐
│ 任务                           │ 02:59  认领    合同 C-2041，7 天后到期   │
│                                │ 03:00  读      crm.getContact(C-2041)    │
│ > followup-before-expiry  跑中 │ 03:00  写      crm.createTask(跟进 …)    │
│   lead-enrich             排队 │ 03:01  等批准  发送催款邮件（不可逆）    │
│   weekly-digest           完成 │                                          │
│   invoice-chase           失败 │                                          │
│                                │                                          │
│ 没有输入框；入口是任务类型     │ [ 批准 ]   [ 补充信息 ]   [ 叫停 ]       │
└────────────────────────────────┴──────────────────────────────────────────┘
 别的系统看到的只有 HTTP：POST /v1/tasks · GET /v1/sessions/:id/entries · POST …/input
```

业务方看到的是一个只读页面：左边任务列表，右边某次会话的 entries 时间线，底部三个介入按钮。没有输入框——入口是任务类型。别的系统看不到页面，只看到四条 HTTP。

### 流程图

```text
别的系统 / 定时器（schedules.ts）
            │ POST /v1/tasks { type, payload, runAt? }
            ▼
┌────────────────────────┐
│ app/http：写一行任务   │  只写不跑；至多 poke 一下 dispatcher，不 await
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ dispatcher：claimDue   │  未到期 / 被别的 worker 租走 → 等下一轮
└───────────┬────────────┘
            │ 租到一行（任务租约）
            ▼
┌────────────────────────┐
│ 按 type 取任务定义     │  <domain>/tasks/<type>.ts：目标模板、可用 tools、完成判据
│ 开 session             │  第一条 entry 就是任务目标
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ core loop              │◀──────────────────────────────────┐
│ 读 SOP → 选 tool       │                                   │
│ → 经 integration 调用  │                                   │
│ → 落 entry             │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
            ◇ 副作用不可逆？──是──→ 暂停，落「等批准」entry  │
            │否                     ├ 人批准（POST …/input）─┤
            │                       └ 人叫停 ──→ 标记失败    │
            ▼                                                │
            ◇ 完成判据满足？──否─────────────────────────────┘
            │是
            ▼
┌────────────────────────┐
│ 写 WorkerResult        │  失败：attempts + 1，backoff 后重投；超上限停下等人看
│ 释放任务租约           │
└────────────────────────┘
```

两个 `◇` 是这类产品的全部人机接触点：不可逆动作等批准，完成判据不满足就继续。人不在，流程照走。

### 目录

```text
agent/
├── AGENTS.md                       # 边界：智能只在 core + <domain>；装配只在 app
├── package.json                    # workspaces: packages/*  packages/session-backends/*
│
├── packages/
│   ├── telemetry/                  # 零依赖契约 + conformance
│   ├── ai/                         # 供应商统一层；不知道 agent 存在
│   ├── core/                       # 运行时（库）：loop / capabilities / session；不含领域词汇
│   ├── session-backends/
│   │   ├── jsonl/                  # 默认
│   │   └── sqlite/                 # 跟 web 一起来
│   │
│   ├── queue/                      # ★ 脊柱。不 import core
│   │   └── src/
│   │       ├── task.ts             # { id, spec: { type, payload }, runAt, leaseUntil, attempts }
│   │       ├── claim.ts            # claimDue；FOR UPDATE SKIP LOCKED
│   │       └── backoff.ts
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
│   ├── protocol/  client/  server/ # 后置：第二个宿主出现再建（P3）
│   └── evals/                      # 门禁：跑 <domain>/evals
│
└── docs/
    ├── architecture.md
    └── boundaries.md               # 各包禁止事项清单
```

### 层 → 目录

| 层          | 落点                                                   | 不做什么                                                   |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| 契约        | `telemetry`                                            | 依赖数趋零                                                 |
| 供应商      | `ai`                                                   | 不知道 agent 存在                                          |
| 编排        | `core`                                                 | 不含领域词汇；不知道「线索」「合同」是什么；不碰任务表     |
| 状态        | `core/src/session` + `session-backends`                | append-only；不改历史                                      |
| 队列        | `queue`                                                | 不 import `core`；不知道认领之后要干什么                   |
| 领域        | `<domain>`：tasks / tools / skills / schedules / evals | 不 import `queue`、不碰进程；只被 `app` 装配               |
| 外部系统    | `integrations/<vendor>`                                | 不知道 LLM 存在；不出现在 prompt 里                        |
| 装配 / 入口 | `app`                                                  | HTTP 只写任务行、只读 entries、只投 input；loop 不跑在请求里 |
| 体验        | `web`                                                  | 只读 + 介入；不长 CRUD；不调供应商                         |
| 质量        | `evals` → `<domain>/evals`                             | 测领域结果（写对了没有），不测「回答像不像」               |

### 硬规则

1. 智能只住 `core` + `<domain>`。`app/http`、`web` 不调模型、不 enrich、不打分。
2. 队列行是消息；HTTP 不驮完整 loop。投工后至多 poke，不 await。
3. `queue` 不 import `core`。它只认任务行和租约，不知道认领之后要干什么；接线在 `app/src/dispatcher.ts`。
4. 认领任务后必须开 session。不存在「只写日志不建会话」的后台执行。
5. `core` 不含领域。领域词汇只出现在 `<domain>` 和 `integrations`；CI 用 grep 守门。
6. 领域 tool 碰外部系统必须经 `integrations`，不在 tool 里拼 HTTP / SQL。tool 负责 schema 和副作用声明，integration 负责调用。
7. 副作用声明必填：读 / 写 / 不可逆。不可逆动作默认停下等 approve，除非该任务类型显式放行。
8. 一个任务类型至少一条 eval；没有 eval 的任务类型不许进 `schedules`。
9. `web` 只读 entries + 投 input。任何 CRUD 需求长在业务方自己的系统里——这是对助手类的防线。
10. 没有「随便问点什么」的入口。入口是任务类型，不是聊天框。
11. 缺能力只减菜单，不抛错。工具报告观测来源，不报告 confidence。

### 完成线

| 阶段 | 必须能对外提供                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------- |
| P0   | `core` 跑通一轮；JSONL session；`claimDue`；HTTP 投工；**一种**任务类型端到端 + 它的 eval           |
| P1   | `web` 看 entries + 介入；`schedules` 定时投工；不可逆动作 approve；sqlite                          |
| P2   | 第二、三种任务类型；第二家 `integrations`；evals 当发布门禁；backend / telemetry conformance 齐   |
| P3   | 多 worker 扇出；第二个宿主（嵌进客户产品）出现时再建 `protocol` / `server` / `client`             |

第一批对外接口（P0）：

```text
POST /v1/tasks                          投工：{ type, payload, runAt? }
GET  /v1/sessions/:id/entries?since=    拉执行记录，entry id 当游标
POST /v1/sessions/:id/input             人介入：approve / 补信息 / 叫停
GET  /health
```

普通 HTTP，直接读写任务表和 session 后端，不经过帧协议。`TaskSpec` 就是 `{ type, payload }`，`type` 对应 `<domain>/src/tasks/` 里的一个文件。

### 失败模式

- **长成助手类。** 客户要 dashboard，`web` 里长出表单，`app/http` 里长出 CRUD。守住规则 9。
- **领域泄进 `core`。** 某个 prompt 模板里出现「线索」。守住规则 5。
- **智能和进程绑死。** 想把同一套 loop 嵌进客户产品时只能起 HTTP 客户端去调它——crm / simie 就停在这里。`core` 是库、`protocol` 后置到 P3，是为这一天留的。
- **换领域要重写 `<domain>`。** 这是代价不是 bug；`core` 不用改就是分层的回报。

---

## 通用类 Agent

**命题：产品是「可嵌入、可远程、可扩展的 agent 运行时」。** 买的人是开发者，把它嵌进自己的产品或直接用 CLI。护城河在契约的稳定性：protocol、extension-api、session 格式。别人嵌了你就不能随便改。

参考系有两种做法，同一个类型：

|            | pi — 分层库                                     | dsh — 全插件                                     |
| ---------- | ----------------------------------------------- | ------------------------------------------------ |
| 产品是什么 | 带 `bin` 的包                                   | 一份叠加出来的配置（profile）                    |
| 智能形态   | `agent` 包是库；进程形态由 `server` / `client` 决定 | `agent-loop` 是插件树上一个可换插件            |
| 可插点     | 传输 / 后端 / 扩展，各带 conformance            | 一切；每个 seam 三角色 + 运行时 invariant        |
| 代价       | 固定分层，换 loop 要改代码                      | 249 个包、Cordis 容器；不带框架用不了任何一块    |

### 产品简笔画

```text
┌─ $ agent ────────────────────────────────────────────────────────────────────┐
│ > 把 packages/core 里的 retry 改成指数退避，补测试                           │
│                                                                              │
│   read   packages/core/src/retry.ts                                          │
│   edit   packages/core/src/retry.ts            +14 -3                        │
│   bash   pnpm test --filter core               12 passed                     │
│                                                                              │
│ 改好了。退避上限 30s，新增 3 个用例。                                        │
│                                                                              │
│ session 7c2e · 12 entries · lease exclusive · Ctrl-D detach（server 不停）   │
└──────────────────────────────────────────────────────────────────────────────┘
 同一个 core 的另外三张脸：agent -p "…"  ·  agent --rpc（嵌进别人的产品）  ·  agent --serve unix:…
```

开发者看到的是一个终端。另外三张脸不是「功能」，是同一份 core 换了宿主：core 是库，谁装配谁是进程。

### 流程图

```text
开发者 / 别人的产品
            │ CLI · rpc (stdio) · client ═══帧协议═══ server
            ▼
┌────────────────────────┐
│ 宿主装配 core          │  选模型、装 extension、选 session backend；core 自己不选
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ create / attach        │  attach 靠 snapshot 对齐；lease exclusive | shared
│ session（entry 树）    │
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ input                  │◀──────────────────────────────────┐
└───────────┬────────────┘                                   │
            ▼                                                │
┌────────────────────────┐                                   │
│ core loop              │◀──────────────┐                   │
│ 通用五件 tool，或      │               │                   │
│ extension-api 进来的   │               │                   │
│ → 落 entry             │  可见⟺已记录  │                   │
└───────────┬────────────┘               │                   │
            ▼                            │                   │
            ◇ 模型还要调 tool？──是──────┘                   │
            │否                                              │
            ▼                                                │
            ◇ 本轮结束；等下一条 input ──有──────────────────┘
            │ detach：server 不停；另一个 client attach 回来，snapshot 对齐
            │ --serve + queue：POST /v1/tasks → claimDue → 开的是同一种 session
            ▼
            get_entries --since <id>  任何时候都能续读，跨重启
```

两层循环：内层是一轮里模型反复调 tool，外层是等下一条 input。detach 不打断任何一层；队列只是给外层多加一种 input 来源。

### 参考仓怎么摆

**pi** — 没有 `apps/`，全是 `packages/*`，产品只是带 `bin` 的包。build 顺序就是依赖顺序：

```text
telemetry → tui → ai → agent → session-backends → protocol → client → server → coding-agent
```

```text
pi/packages/
├── telemetry/                  # 零依赖。契约 + testing/conformance.ts
├── tui/                        # 差分渲染终端 UI；与 agent 无关
├── ai/                         # 供应商统一 API；模型目录生成
├── agent/                      # ★ 运行时（库）
│   └── src/
│       ├── agent-loop.ts
│       └── harness/
│           ├── tools/          # bash / edit / read / write / image 各一文件
│           ├── skills.ts  system-prompt.ts
│           ├── compaction/     # 上下文压缩 + 分支摘要
│           └── session/        # entry 树、jsonl/、testing/conformance.ts
├── protocol/                   # CBOR + 长度前缀分帧 + schema；只依赖校验库
├── client/                     # 远程会话客户端；root 无 node import
├── server/                     # 会话服务器；listener、transports/unix/、testing/
├── session-backends/sqlite-node/
├── coding-agent/               # 产品 CLI（bin）
│   └── src/
│       ├── core/               # 装配：session、模型、设置、扩展
│       ├── modes/              # interactive（TUI）/ print / rpc（JSONL over stdio）
│       └── client/  server/  extensions/
└── evals/                      # *.eval.ts + vitest-evals
```

pi 的三个关键设计：

- **session 是 append-only 的 entry 树。** entry id 稳定，能当游标：`get_entries --since <id>` 跨重启续读。压缩、fork、clone 都是往树上加节点，不删历史。
- **「关客户端还能跑」靠租约，不靠队列。** session 活在 server 侧，client `detach` 后服务端不停，另一个 client `attach` 回来靠 snapshot 对齐。exclusive / shared 两种租约防并发写。这解决的是「多端接同一个会话」，**不是**「没人看着时自己找活干」。
- **领域对象和线上 DTO 互不认识。** `ai` 的类型和 `protocol` 的 DTO 是两套，转换职责显式归 `server` 包，用编译期字段清单强制「`ai` 加字段必须过一次 review」。

**dsh** — 没有特权 core。模型适配器、tool 注册表、session log、agent loop 本身都是 [Cordis](https://github.com/cordiverse/cordis) 插件。产品是 profile：`dsh --profile web --dump-config` 打印出来的每一行都能被上一层 patch 替换。

```text
deepseek-harness/
├── vendor/                         # 钉版本的 Cordis 源码（框架本体）
├── packages/<group>/<pkg>/
│   ├── core/                       # 脊柱：session / system-prompt / tools / agent / agent-loop
│   │   └── agent-loop/             #   默认 loop 驱动（ctx.agentLoop）；扩展不许依赖它
│   ├── llm/                        # ctx.llm 契约 + llm-deepseek / llm-pi-ai（← 依赖 pi 的 ai 包）
│   ├── session/  session-query/    # 持久化契约 + jsonl 后端；读侧 sqlite 全文索引
│   ├── shell/                      # 每个能力三件套：
│   │   ├── shell/                  #   Service Definition（抽象类，ctx.shell）
│   │   ├── bash-local/  bash-sandbox/  pwsh-local/   # Providers
│   │   └── tool-bash/              #   Consumer（模型可见的 tool）
│   ├── subprocess/  fs/  terminal/  sandbox/  lsp/  web/  skill/  compaction/  subagent/   # 同上
│   ├── webhook/  schedule/  jobs/  goal/   # 沾「没人看着」的四个包，都停在认领之前
│   ├── sdk/  acp/  api/  host/     # JSON-RPC over stdio / ACP / Web GUI 网关
│   ├── bundle/                     # ★ 产品 = patch 层：base / web-app / headless / sdk-app / acp-app
│   └── boot/  preset/  settings/  interaction/  …
├── apps/cli/                       # 唯一 bin：dsh --profile <name>
├── snapshots/                      # 无 key 的录制会话回放，当门禁
└── .agents/notes/                  # 每个非平凡改动一篇决策记录
```

dsh 的三个关键设计：

- **可插点是三角色，缺一个不算。** Service Definition（`ctx.<key>` 的抽象类）/ Provider / Consumer。`shell/shell` 定义 → `bash-local` / `bash-sandbox` 实现 → `tool-bash` 消费；换沙箱不改 tool。
- **模型可见 ⟺ 已记录。** 任何进入模型请求的东西都必须能从 session log 重建；新增一种模型可见输入 = 新增一种 session 事件；有运行时 invariant 守着。
- **产品是配置，不是包。** profile = 按序叠加各 bundle 的 `cordis.patch.yml`。patch 按 id 替换整行，所以换 loop 和换模型是同一种操作。

dsh 怎么答「没人看着」：`webhook` 验签后直接开 session（是投工，但不落任务行，无重试无去重）；`schedule` 只在活会话里；`jobs` 进程内；`goal` 是状态不是调度器。**有投工，没认领。**

dsh 的 `llm-pi-ai` 直接依赖 pi 的 `ai` 包：「`ai` 不知道 agent 存在」这条边界确实能独立复用，本文的 `ai` 包照此切。

### 目录

取 pi 的分层，不取 dsh 的容器：十来个包，固定分层比容器便宜。从 dsh 借两条规则——三角色、模型可见 ⟺ 已记录——不借框架。相对 pi / dsh 只多一处：把队列做成可选层。

```text
agent/
├── packages/
│   ├── telemetry/  ai/             # 同垂直类
│   ├── tui/                        # 终端 UI；与 core 无关
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
│   ├── extension-api/              # ★ 契约：第三方 tool / skill / hook 的接口 + conformance
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

| 层     | 落点                                     | 不做什么                                                 |
| ------ | ---------------------------------------- | -------------------------------------------------------- |
| 契约   | `telemetry` `protocol` `extension-api`   | 依赖数趋零；三个都配 conformance；加字段走版本           |
| 供应商 | `ai`                                     | 不知道 agent 存在                                        |
| 编排   | `core`                                   | tools 只有通用五件；不选传输、不管进程形态               |
| 状态   | `core/src/session` + `session-backends`  | append-only；entry id 稳定，可当跨重启游标               |
| 传输   | `protocol` `client` `server`             | `server` 不含业务；鉴权归 listener；在这里是产品，不是配件 |
| 队列   | `queue`                                  | 可选依赖；`core` / `server` / `client` 不 import 它      |
| 扩展   | `extension-api` + 第三方包               | 过 conformance 才算扩展                                  |
| 产品   | `app`                                    | 唯一装配点；四种 mode 共用一个 core                      |
| 质量   | `evals` + 各契约 conformance             | 通用基准；契约变更必须过 conformance                     |

### 硬规则

1. agent 是库；进程形态由 `server` / `client` / CLI 决定。
2. `core` 的 tools 只有通用五件。领域动作一律走 `extension-api`，包括你自己写的。
3. 契约包依赖数趋零。`telemetry` 零依赖，`protocol` 只依赖校验库。
4. 每个对外契约（protocol / extension-api / telemetry / session backend）先写 conformance 再写实现；每个可插点契约 / 实现 / 消费者三角色齐全。
5. session append-only；entry id 稳定。模型可见 ⟺ 已记录：进 loop 请求的都能从 entries 重建。
6. 运行时中立：包的 root 入口不 import node 内建模块；node 专属能力走子路径导出。
7. 兼容性是产品：protocol 加字段走版本号；entry 格式只增不改；破坏性变更走 major。
8. `queue` 是可选依赖。不装 queue 的宿主拿到的是完整产品，不是残缺版。
9. `app` 是唯一的参考实现。不建第二个 example，不建 demo 仓。
10. `docs/why-not-pi.md` 必须存在且能说服一个正在用 pi 或 dsh 的人。写不出来，方向不成立。

### 完成线

| 阶段 | 必须能对外提供                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| P0   | `core` + JSONL；`protocol` + `server` + `client` + unix transport；CLI 三模式（interactive / print / rpc）；session conformance |
| P1   | attach / detach、会话租约、snapshot 对齐；sqlite；`extension-api` + 第一个第三方扩展过 conformance                 |
| P2   | `queue` 作为可选层接入 serve 模式：`POST /v1/tasks` 投工进 server；evals 当门禁                                    |
| P3   | 第二种 transport（tcp / ws）；扩展分发；多 worker                                                                  |

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

`TaskSpec` 在这里是 `{ goal, cwd?, tools? }`——自由目标，不是任务类型。

### 失败模式

- **做成更差的 pi / dsh。** 唯一的差异是 queue；先问「pi + 一个扩展 + 一个 cron」能不能做到，再问「dsh + webhook + schedule」为什么不够。第二个问题的答案只能是认领——租约、重试、跨进程——不能是别的。
- **没有客户。** 通用运行时卖给开发者靠生态，生态靠契约稳定；契约变一次，扩展死一批。
- **「无 `examples/`」承压。** 想建 demo 的冲动说明 `app` 没做好参考实现的角色。

---

## 助手类 Agent

**命题：产品是已经存在的业务系统，agent 是它角落里的聊天框。** 买的人已经是这个产品的用户；诉求是「少点几下」「问一句就改好」。人问一句、答一句，顺手写几条数据。关掉页面就停。

参考系：多数「AI CRM / AI 后台」。先有完整 CRUD 产品，再在页面角落加 ChatWidget，`/api/chat` 与业务 API **同进程**。各家后台的「AI 助手」侧栏都是这个形态。

这是一个合法的类型，不是错误——错误是**想要无人值守却选了它**。产品已经有、诉求只是「少点几下」时，它是最便宜的路。

### 产品简笔画

```text
┌─ CRM · 联系人 ───────────────────────────┬─ AI 助手 ──────────────────────────────────┐
│ 姓名      公司        阶段       负责人  │ 你：把张三标成高意向，下周二提醒我         │
│ 张三      Acme        初次接触   李四    │                                            │
│ 王五      Beta Inc    报价       李四    │ AI：已把阶段改为「高意向」                 │
│ 赵六      Gamma       成交       王五    │     已创建提醒 9/9 10:00                   │
│                                          │     （contacts.update · reminders.create） │
│ [ 新建联系人 ]  [ 导入 ]  [ 导出 ]       │                                            │
│                                          │ ┌──────────────────────────────┐           │
│ CRUD 才是主体；没有右边也完整            │ │ 输入…                   发送 │           │
└──────────────────────────────────────────┴────────────────────────────────────────────┘
 关掉页面，右边就停了。没有任务列表、没有 run、没有「明天再来看」
```

左边是完整产品，右边是外挂。把右边整个删掉，左边不缺任何功能——这是助手类的定义。左边不必和右边在同一个产品里：宿主是别处的订单系统、知识库时，聊天框自己成一个产品，仍是助手类，见目录里的独立部署变体。

### 流程图

```text
人（页面开着）
            │ 在侧栏输入一句
            ▼
┌────────────────────────┐
│ POST /api/chat         │  与业务 API 同进程；流式返回
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ chat.service           │◀──────────────────────────────────┐
│ 拼 prompt → 调 SDK     │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
            ◇ 模型要调 tool？──否──→ 回答写进 ChatLog        │
            │是                            │ 流式回页面      │
            ▼                              ▼                 │
            ◇ 不可逆？──是──→ 先问人确认   人关页面 → 全停   │
            │否 / 已确认                   没有后台、重试    │
            ▼                                                │
┌────────────────────────┐                                   │
│ tool → 领域 service    │                                   │
│ 同一套权限 → 写业务表  │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
            ◇ 步数超上限？──否───────────────────────────────┘
            │是
            ▼
            停下来。这是该建任务表、换成垂直类的信号，不是加 cron 的信号
```

整条流程活在一个 HTTP 请求里，智能和领域 service 在同一个进程，靠 import 直接调。「人关页面 → 全停」不是缺陷，是这一类的边界；步数超上限那条出口是换类型的信号。

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
│       └── chat/                  # ★ 后加的一层，和业务模块平级
│           ├── chat.controller.ts # POST /api/chat；流式
│           ├── chat.service.ts    # 拼 prompt、调 SDK；步数上限
│           ├── prompts/
│           ├── tools/             # 一文件一工具；只调领域 service，不直连表
│           └── chat-log/          # 记 tool 调用与结果，不只记 messages[]
│
└── packages/
    ├── db/                        # Contact / Deal / User + ChatLog；无 AgentTask
    └── shared/                    # DTO；无 TaskSpec
```

常见变体（仍是助手类，只是聊天代码换地方）：

```text
apps/web/app/api/chat/route.ts     # Next 单体：前端仓里直接调模型
packages/ai/                       # 后来抽出的 SDK 封装，loop 仍在请求里
```

独立部署变体（仍是助手类，只是宿主在别的进程）：宿主系统没地方给你加侧栏，或者要接的宿主不止一个，聊天框就自己成一个产品。`chat` 模块升格成 `app`，领域 service 换成 `integrations`，其余不变。

```text
agent/
├── packages/
│   ├── ai/  core/                  # core 的 loop 跑在请求里，带步数上限
│   ├── integrations/<host>/        # 宿主系统的 API client：订单系统、知识库…；不知道 LLM 存在
│   ├── session-backends/sqlite/    # 会话列表要持久化，P0 就要
│   ├── app/src/
│   │   ├── http/chat.ts            # POST /api/chat；流式
│   │   ├── tools/                  # 一文件一工具；只调 integrations，用户身份透传
│   │   ├── prompts/
│   │   └── chat-log/
│   └── web/                        # 聊天页：新会话 / 历史 / 技能菜单；没有业务表单
│
└── 没有 queue/  没有 dispatcher  没有 schedules.ts
```

识别：目录像垂直类去掉 `queue` 和 `<domain>/tasks`；入口仍是聊天框；「技能」菜单是 tools 的列表，不是任务类型。

### 层 → 目录

| 层   | 落点                                 | 不做什么                                     |
| ---- | ------------------------------------ | -------------------------------------------- |
| 体验 | `apps/web` 业务页面 + `chat-widget`  | 聊天框不拥有路由和数据                       |
| 领域 | `api/modules/contacts` `deals`；独立部署时是宿主系统，经 `integrations` 进来 | 不知道聊天存在；权限在这里 |
| 聊天 | `api/modules/chat`                   | 不拥有调度；不长 cron；不绕过领域 service    |
| 工具 | `chat/tools`                         | 只 import 领域 service；同一套权限           |
| 状态 | `ChatLog`                            | 记 tool 调用 + 结果；没有任务、没有 run      |

### 硬规则

1. tools 只经领域 service，复用同一套权限校验；不直连表、不拼 SQL。独立部署时领域 service 在宿主里，tools 只经 `integrations` 调宿主 API，用户身份透传，不用服务账号绕过宿主的权限。
2. 请求内 loop 有步数上限，走流式。超上限就是该建任务表的信号——换类型，不加 cron。
3. `chat` 模块不拥有调度。出现 schedule / webhook 就已经不是助手类了。
4. `ChatLog` 至少记 tool 调用与结果，不只记 `messages[]`；出问题能查到「它改了什么」。
5. 不可逆动作先确认再执行；聊天框里的「好的」不算授权。

### 完成线

| 阶段 | 必须能对外提供                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| P0   | `POST /api/chat` 流式；请求内 loop 带步数上限；**一个** tool 端到端 + 它的 eval；ChatLog 记 tool 调用与结果；有「历史」侧栏则会话持久化也在 P0 |
| P1   | 其余 tool 逐个上，每个带 eval；「技能」菜单从 tools 目录生成，不手写；有写动作才加确认流                          |
| P2   | 检索类 tool 的 eval 测命中条目，不测措辞；权限透传接通，宿主按用户身份鉴权                                          |
| P3   | 无。步数超上限、想要无人值守 → 换垂直类，不在这里加 cron                                                          |

### 识别特征与天花板

结构特征（用来识别，不是优点）：没有 worker 进程（独立部署变体有进程，但它只应答 HTTP，不认领）；没有 `AgentTask` / `claimDue`；prompt / tool 挂在 `chat` 模块，和 `contacts` 平级，不拥有调度；供应商 SDK 出现在 API 或 Next route；记忆往往只有 `messages[]`。

天花板：**没有投工，只有「再问一句」。**「工作」= 用户还开着页面。要「凌晨三点自己去查一遍」，这套里没有位置——加 cron 只会长出一个残缺的垂直类：loop 跑在请求进程里、没有租约、没有重试、没有执行记录。

---

## 工作流类 Agent

**命题：图是人画好的，LLM 只在节点里填空。** 产品是「可复用的流程 + 每一步可追溯」。买的人是流程负责人 / 运营，多半不写代码。自主度低、确定性高；换来的是可预测、可审计、可回放。

参考系：Dify / Coze 工作流、n8n、LangGraph（静态图那一半）、Temporal（durable execution 那一半）。

### 产品简笔画

```text
┌─ 工作流：合同到期跟进 · v3（已发布） ────────────────────────┬─ run #418 回放 ──────────────────┐
│                                                              │ 1  取数        ok    0.2s        │
│ [定时]──▶[取数]──▶[LLM 抽取]──▶◇ 分支──▶[LLM 生成]──▶[写回]  │ 2  LLM 抽取    ok    1.8s        │
│                                │                             │ 3  分支        → 需审核          │
│                                └──▶[人工审核]──▶[写回]       │ 4  人工审核    等待中…           │
│                                                              │    [ 通过 ]   [ 驳回 ]           │
│ 节点面板：llm · tool · branch · loop · human · code          │                                  │
│ 每条边带类型；端口对不上发布不了                             │ checkpoint 4/6 · 可从任一步重放  │
└──────────────────────────────────────────────────────────────┴──────────────────────────────────┘
 workflows/<name>/fixtures/ 里的输入 = eval；改图必须过
```

买家看到的是画布和回放。节点是积木，边是人连的；右边每一步都能点开看输入输出。LLM 被关在节点框里：它决定节点的输出，不决定下一步去哪。

### 流程图

```text
触发（表单 / webhook / 定时）
            │ 带输入
            ▼
┌────────────────────────┐
│ 取已发布的图版本 vN    │  跑中的 run 绑定 vN；改图不影响它
│ 开一个 run             │
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ 取当前节点，执行       │◀──────────────────────────────────┐
│ llm / tool / branch /  │                                   │
│ loop / human / code    │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
            ◇ human 节点？──是──→ 暂停，等人输入 ──输入到了──┤
            │否                                              │
            ▼                                                │
            ◇ 输出过 schema？──否──→ 节点级重试（幂等键）────┤
            │是                                              │
            ▼                                                │
┌────────────────────────┐                                   │
│ 落 checkpoint          │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
            ◇ 还有下一条边？──是──→ 沿边走到下一节点─────────┘
            │否
            ▼
            run 结束；输出写回；和 fixtures 对比 = eval。LLM 从没决定过「下一步去哪」
```

流程图里没有「模型决定下一步」这一格：下一步永远由边决定。三个 `◇` 分别管 human 节点、schema 校验、走不走下一条边，全是确定性的。

### 目录

```text
workflow/
├── packages/
│   ├── ai/                         # 供应商层；同前
│   │
│   ├── graph/                      # ★ 图的定义与校验；不执行
│   │   └── src/
│   │       ├── schema.ts           # 图 DSL（yaml / json）+ 校验
│   │       ├── nodes/              # 节点类型，一文件一种：llm / tool / branch / loop / human / code
│   │       └── compile.ts          # DSL → 可执行图；端口类型静态检查
│   │
│   ├── runner/                     # ★ 执行器
│   │   └── src/
│   │       ├── run.ts              # 按图走；节点无状态
│   │       ├── checkpoint.ts       # 一步一落盘；可从任一步重放
│   │       └── retry.ts            # 节点级重试；幂等键
│   │
│   ├── triggers/                   # 表单 / webhook / 定时 → 开一个 run
│   ├── store/                      # workflow 版本、run、step 事件
│   ├── app/                        # bin：API（发布 / 触发 / 查 run）+ runner 进程
│   └── web/                        # 画布编辑器 + run 回放
│
├── workflows/                      # ★ 产品资产：一目录一流程，版本化
│   └── <name>/
│       ├── graph.yaml
│       ├── prompts/
│       └── fixtures/               # 回放用输入；也是 eval
│
└── docs/
```

### 层 → 目录

| 层       | 落点                  | 不做什么                               |
| -------- | --------------------- | -------------------------------------- |
| 图定义   | `graph`               | 不执行；不 import `runner`             |
| 节点     | `graph/src/nodes`     | 无状态；输入输出都过 schema            |
| 执行     | `runner`              | 不知道具体流程；只认编译后的图         |
| 触发     | `triggers`            | 只开 run，不决策                       |
| 状态     | `store` + checkpoint  | run 绑定流程版本；append-only          |
| 流程资产 | `workflows/<name>`    | 是数据不是代码；运行时不 import 它     |
| 体验     | `web`                 | 画图 + 回放；不跑节点                  |

### 硬规则

1. 图是数据，不是代码。`runner` 不 import 任何具体流程；流程通过 DSL 加载、校验、编译。
2. LLM 节点输出必须过 schema（结构化输出）。下游节点不解析自然语言。
3. 一步一 checkpoint；任何 run 可从任一步重放，重放结果一致。
4. 节点无状态。状态只在图状态里流转，不藏在节点实例里。
5. human 节点是一等节点：暂停、等输入、续跑，和 llm 节点一样落 checkpoint。
6. 发布的流程版本不可变；跑中的 run 绑定版本，改图不影响在跑的。
7. `fixtures` 就是 eval：每个流程至少一组输入 + 期望输出，改图必须过。

### 失败模式

- **分支爆炸。** 图越画越大，「该让 LLM 决定的」用 branch 硬写了。这是该换成垂直类的信号：给目标和工具，不给步骤。
- **自然语言在节点间流。** LLM 节点吐一段话，下游用正则解析。守住规则 2。
- **节点里藏状态。** 重放不一致、并行不安全。守住规则 4。
- **触发器长成队列。** 想要「失败了三点再试」「多台机器分摊」时，`triggers` 里长出租约。此时要的是垂直类的 `queue`，别在 `triggers` 里重新发明。

盲区：**处理不了「不知道下一步是什么」的任务。** 开放目标要换类型。

---

## 多 Agent 系统

**命题：一个编排者把目标拆给多个角色 agent，各带自己的 prompt / tools / 上下文窗口，产物汇总。** 产品是「一个上下文窗口装不下的活」：长文研究、代码生成 + 审查、多源调查。买的是研究 / 生成类需求。

参考系：deep research 类产品、MetaGPT、CrewAI、OpenAI Agents SDK 的 handoff、dsh 的 `subagent/` 包、Claude Code 的 subagent。多数场合它是前面几类**内部**的组织方式——垂直类的一个任务类型内部拆子 agent，通用类的一个 tool 是 spawn subagent；单独成产品时目录如下。

### 产品简笔画

```text
┌─ deep research ──────────────────────────────────────────────────────────┐
│ 目标：2026 年国内 AI Agent 框架格局，给出选型建议                        │
│                                                                          │
│ 编排者    已拆 4 个子任务 · 第 2/3 轮 · 预算已用 38%                     │
│ ├ 研究员 A  检索 pi / dsh / LangGraph 仓库       完成 → 黑板 #1          │
│ ├ 研究员 B  检索国内商用框架                     跑中 · 12 次 fetch      │
│ ├ 写手      等黑板 #1 #2                         排队                    │
│ └ 审校      —                                    排队                    │
│                                                                          │
│ 黑板   #1 框架清单（12 条，结构化）   #2 —   #3 —                        │
│                                                          [ 停止并出稿 ]  │
└──────────────────────────────────────────────────────────────────────────┘
 每个子 agent 一条 session，点进去看得到；超预算是正常终止，出「未完成 + 已有产物」
```

买家看到的是一个目标、一棵进度树、一块黑板和一个预算条。「停止并出稿」随时可按——超预算和主动停止是同一种正常结束。

### 流程图

```text
人 / 系统
            │ 一个目标
            ▼
┌────────────────────────┐
│ 编排者：拆任务         │  自己也是 agent；只拆、派、收，不干具体活
│ 定硬预算               │  轮次 / token / 时间
└───────────┬────────────┘
            ▼
┌────────────────────────┐
│ 派活：并行 / 串行 /    │◀──────────────────────────────────┐
│ handoff 给角色         │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
┌────────────────────────┐                                   │
│ 每个角色各跑一条       │  自己的 prompt、tools 白名单      │
│ 单 agent session       │  上下文窗口互不共享；带 parent id │
│ 产物过 schema → 黑板   │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
┌────────────────────────┐                                   │
│ 编排者收结果           │                                   │
└───────────┬────────────┘                                   │
            ▼                                                │
            ◇ 预算耗尽？──是──→ 正常终止：未完成 + 已有产物  │
            │否                                              │
            ▼                                                │
            ◇ 目标达成？──否──→ 决定下一轮───────────────────┘
            │是
            ▼
            汇总黑板出产物；整体 eval 测产物，不测过程
```

外层循环由编排者驱动，每一轮里角色各跑自己的单 agent session，互不共享上下文窗口，只共享黑板上的结构化产物。预算那个 `◇` 排在目标达成之前——先问钱够不够，再问活干完没。

### 目录

```text
multi-agent/
├── packages/
│   ├── ai/  core/                  # 单 agent 运行时；同通用类。多 agent 是在它之上组织，不是替代
│   │
│   ├── roles/                      # ★ 一目录一角色
│   │   ├── planner/
│   │   ├── researcher/
│   │   ├── writer/
│   │   └── reviewer/
│   │       ├── prompt.md
│   │       ├── tools.ts            # 白名单；reviewer 没有 write
│   │       └── output.schema.ts    # 交到黑板上的产物长什么样
│   │
│   ├── orchestrator/               # ★ 编排者；自己也是一个 agent
│   │   └── src/
│   │       ├── plan.ts             # 拆任务
│   │       ├── dispatch.ts         # 并行 / 串行 / handoff
│   │       ├── budget.ts           # 轮次 / token / 时间；超预算是正常终止
│   │       └── merge.ts            # 收结果、决定下一轮或收工
│   │
│   ├── blackboard/                 # ★ 共享工作区：结构化中间产物
│   ├── bus/                        # agent 间消息：from / to / run / parent
│   ├── session-backends/           # 每个子 agent 一条 session，带 parent id；整棵树可回放
│   ├── app/
│   └── evals/                      # 测最终产物 + 每个角色单独测
│
└── docs/
```

### 层 → 目录

| 层         | 落点               | 不做什么                                 |
| ---------- | ------------------ | ---------------------------------------- |
| 单体运行时 | `core`             | 不知道自己是子 agent                     |
| 角色       | `roles/<role>`     | 不 import 其他角色；只通过黑板交产物     |
| 编排       | `orchestrator`     | 不干具体活；有硬预算                     |
| 共享状态   | `blackboard`       | 结构化；不是 messages 拼接               |
| 通信       | `bus`              | 每条带 parent；不 import 任何角色        |
| 状态       | `session-backends` | 一子 agent 一 session；父子链接          |
| 质量       | `evals`            | 先测角色，再测整体                       |

### 硬规则

1. 先证明单 agent 做不到，再拆。一个 skill 能解决的不拆。
2. 每个角色 tools 白名单：reviewer 不许 write，researcher 不许 deploy。
3. 子 agent 之间不共享上下文窗口；共享的是黑板上的结构化产物。
4. 编排者有硬预算：轮次 / token / 时间。超预算是正常终止，落「未完成 + 已有产物」，不是异常。
5. 每个子 agent 一条 session，带 parent id；整棵树可回放。
6. 角色先单独过 eval，再进编排。整体 eval 测产物，不测过程。

### 失败模式

- **为了多而多。** 单 agent + 一个 skill 就能做的活拆成五个角色：成本 × 5，质量不升，调试 × 5。守住规则 1。
- **群聊。** agent 互相「讨论」不出活。预算守门；`bus` 上每条消息都要有明确 to。
- **黑板变 `messages[]`。** 把全部对话拼给下一个 agent，上下文爆。守住规则 3。
- **编排者变上帝。** 什么都自己干，子 agent 成摆设。编排者只拆、派、收。

盲区：**成本、延迟、可调试性都是倍数级劣化。** 没有清晰的角色边界和黑板 schema，比单 agent 更难排错。

---

## 对照

|             | 垂直类                          | 通用类                                    | 助手类                       | 工作流类                          | 多 Agent                          |
| ----------- | ------------------------------- | ----------------------------------------- | ---------------------------- | --------------------------------- | --------------------------------- |
| 产品中心    | 任务类型 + 领域 eval            | 契约 + 运行时                             | 已有业务表单                 | 画布上的图 + 回放                 | 角色 + 黑板                       |
| 谁驱动      | 别的系统、定时；人偶尔介入      | 开发者（client）；队列可选                | 人在页面上                   | 触发器                            | 人 / 系统给一个目标               |
| 智能住哪    | 独立常驻进程                    | 库；宿主决定进程                          | 业务 API 进程内              | 节点里                            | 多个；各一条 session              |
| 关掉页面    | 继续                            | server 侧继续，可重连                     | 停                           | run 跑到结束                      | 跑到预算耗尽                      |
| 投工 / 认领 | 都有                            | 认领做成可选层                            | 都无                         | 触发即投工；无认领                | 编排者内部派活；对外无            |
| 状态        | 任务表 + entries                | append-only entry 树                      | `messages[]` / ChatLog       | run + checkpoint                  | 黑板 + session 树                 |
| 可插点      | 任务类型、integration           | 传输 / 后端 / 扩展，各带 conformance      | 无                           | 节点类型                          | 角色                              |
| 质量        | 领域结果 eval                   | 契约 conformance + 通用基准               | 无                           | fixtures 回放                     | 角色 eval + 产物 eval             |
| 目录信号    | `queue/` `<domain>/tasks/` `dispatcher` | `protocol/` `server/` `extension-api/` `conformance` | `chat-widget` `chat.service` | `workflows/*/graph.yaml` `checkpoint` | `roles/` `orchestrator/` `blackboard/` |
| 参考系      | crm、simie                      | pi、dsh                                   | 多数 AI CRM                  | Dify、n8n、LangGraph              | deep research、MetaGPT            |
| 典型失败    | 长成助手类                      | 更差的 pi / dsh                           | 想无人值守                   | 分支爆炸                          | 为了多而多                        |

---

## 按产品判型

这一节原来写的是「本仓在垂直类和通用类之间选，不做另外三类：没有现成产品可以外挂」。撤回。第一个进来的产品（履约管家，见下）恰好落在「不做」的那一类——错的不是分型，是**替仓预选了型**。类型是产品的属性，不是仓的属性；仓只管两件事：判型的标尺，和每一型的骨架。哪一型，由产品需求文档定。

### 判型流程

1. 拿需求文档答三个问题：谁驱动、智能住哪、关掉页面还干不干活。文档答不出来的，回去问业务方，不替它猜。
2. 三问落到一类，就取那一类的目录、硬规则、完成线。不混两类的目录。
3. 写第一条 eval。写不出来，说明需求还没到能开工的程度。
4. 每一类「失败模式」里的换型信号出现时换型。换型由产品需求触发，不由仓的偏好触发。

### 跨类型不变的部分

`telemetry` / `ai` / `core` / `session-backends` 四个包五类一样：`core` 无领域、tools 只有通用件、session append-only。先起这四个不算押注。**`queue` 不在共用里**——助手类、工作流类没有它；上一版把它列进共用五包，就是预选了型的痕迹。

类型专属的包等产品到了再建：`queue` / `dispatcher` / `<domain>`（垂直）；`protocol` / `server` / `client` / `extension-api`（通用）；`chat` 模块或独立部署的 `app`（助手）；`graph` / `runner`（工作流）；`roles` / `orchestrator` / `blackboard`（多 Agent）。

跨类型的规则：可插点三角色（契约 / 实现 / 消费者，conformance 挂契约包，少一角就只是内部实现）；模型可见 ⟺ 已记录；HTTP 是薄壳；无 `examples/`，验证靠 test / eval。

### 垂直类与通用类之间

这两类共用 `queue`，边界最近，单列。共用的接法：任务是**意图**，会话是**执行记录**。认领一个到期任务就开一个 session——调度开的会话和人开的会话是同一种东西，同一条事件流，同一个查看器。

```text
调度：任务表 ←claimDue← dispatcher → 开 session → core loop → entries（append-only）
人  ：client attach → 同一个 session → 同一条 entries
```

租约因此出现在两层，各管各的：

| 租约     | 管什么                      | 冲突表现 |
| -------- | --------------------------- | -------- |
| 任务租约 | 谁来干（跨进程）            | 重复认领 |
| 会话租约 | 谁在看 / 谁在改（跨客户端） | 并发写   |

HITL 不是新功能：人 attach 到调度开的 session 上就能介入，这是会话租约的默认能力。

两类都要守 `queue` 不 import `core`。边界上的产品用这张表分辨：

|                              | 垂直类                          | 通用类                                                      |
| ---------------------------- | ------------------------------- | ----------------------------------------------------------- |
| 产品                         | `app` + `<domain>`              | `core` + `protocol` + `server` + `client` + `extension-api` |
| `queue`                      | 脊柱                            | 可选层、相对 pi / dsh 的唯一差异点                          |
| `tools/`                     | 领域动作，副作用声明必填        | 通用五件                                                    |
| `skills/`                    | 领域 SOP                        | 通用；领域的走 extension                                    |
| HITL                         | `web` 看 entries + HTTP input   | attach / 会话租约                                           |
| `server` `client` `protocol` | P3                              | P0                                                          |
| 护城河                       | 任务类型 + 领域 eval            | 契约稳定性 + 生态                                           |
| 直接对手                     | 同领域的助手类产品              | pi / dsh / Claude Code / Codex CLI                          |

### 已判型的产品

**履约管家**（需求文档 2026-09-03）。对话型，DM/PM 问三件事：某订单的当前状态与历史、某品类发某国的交付周期、交付流程知识。三问：人驱动、请求内、关页面停。**助手类，独立部署变体**——宿主是订单系统和交付知识库，都在别的进程；聊天框就是整个产品。

取：`ai`、`core`（请求内 loop、步数上限、流式）、sqlite session（侧栏有「历史」，P0 就要）、三个 tool、`integrations/<订单系统>` 与 `integrations/<知识库>`。不建：`queue`、`dispatcher`、approve 流程（三个 tool 全是读）。

三个 tool 的难点都不在 agent 侧：

- `order.query(orderId)`：先问清订单系统是什么，agent 侧只是一个 integration。
- `delivery.estimate(category, destination)`：需求写的是「基于算法」，是确定性计算，LLM 只做槽位抽取和措辞。算法住 tool 里不进 prompt；「品类 × 目的国 → 天数」的规则表谁给、谁维护要先定。单元测试即 eval。
- `knowledge.search(query)`：依赖一个还不存在的知识库——需求自己写了「部分未经系统性归档，仅依赖经验口口相传」。归档先于 agent，三个里最重。

UI 上的「技能」是三个 tool 的菜单入口；「专家」需求文档里没有，要问。

第一条 eval：订单 X 查回来的状态与订单系统一致。换型信号：出现「订单状态变了主动通知 DM」「承诺交付日前 N 天预警」→ 垂直类，加 `queue`，不加 cron。

### 强制收敛的检验

**第一条 eval 写什么。**「合同到期前 7 天正确创建跟进任务」是垂直类；「在陌生仓库里改对一个函数」是通用类；「订单 X 查回来的状态与订单系统一致」是助手类。一个产品只有一个第一条；写出两条不同类的，就是两个产品。
