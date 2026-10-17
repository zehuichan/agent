# 通用骨架

五类 Agent、15 种产品形态共用一套分层：**类型是组合，形态是入口**。`../README.md` 讲类型怎么分、怎么判型；本篇讲落地目录。包路径与 [dsh](https://github.com/deepseek-ai/deepseek-harness) 同名，对照见 [dsh-map.md](dsh-map.md)；每种形态要填哪些位置见 [forms.md](forms.md)。

本仓不引入 Cordis 容器：只借 dsh 的服务划分、规则和包路径，用普通 TypeScript 写，依赖靠构造注入，产品组合写成代码。

---

## 分层

```text
层 4  入口 / 渠道        网页聊天 · 挂件 · 企微 / IM · 语音 · HTTP API · SDK · …（形态 1–15）
        │  只做翻译：外部输入 → session input；entries → 外部输出
层 3  触发               人在场（同步）· 投工队列 claimDue（带租约）· 图触发器（表单 / 日历 / 定时 → 开 run）
        │  不 import 内核；只决定「什么时候、用哪个 preset 或哪张图、开哪个 session 或 run」
层 2  编排               自由循环（默认）· 图执行器 · 编排者 + 子 Agent
        │  决定「下一步谁说了算」；只调用 Agent，不改 agent-loop
层 1  preset             prompt 版本 + 工具白名单 + 上限 + 输出 schema + 模型
        │  任务类型、角色、工作流节点、助手人设，最后都归结为一个 preset
层 0  内核               core/* · llm/* · session/* · tools · approval · limits · compaction · telemetry
```

判型三问各落在一层：

| 三问 | 落在 | 取值 |
| ---- | ---- | ---- |
| 谁驱动 | 层 3 | 人在场 / 队列认领 / 图触发器 |
| 智能住哪 | 层 0 的部署 | 业务请求内的库 / 独立 worker / server |
| 关掉页面还干不干活 | 层 3 + 会话存放处 | 有队列且会话在服务端 → 干；否则停 |

## 五类各是哪种组合

| 类型 | 编排 | 触发 | 内核部署 | 典型入口 | bundle |
| ---- | ---- | ---- | -------- | -------- | ------ |
| 垂直类 | 自由循环 | 队列认领 + 定时 | 独立 worker | 只读 web + HTTP 投工 | `worker-app` |
| 助手类 | 自由循环，带步数上限 | 人在场 | 业务请求内 | 聊天框、挂件、IM | `assistant-app` |
| 工作流类 | 图执行器；LLM 节点各调一次 Agent | 图触发器 | worker | 画布 + 回放 | `graph-app` |
| 多 Agent | 编排者；角色各是一个子 Agent | 人或系统给一个目标 | worker | 进度树 + 黑板 | `team-app` |
| 通用类 | 自由循环 | 可选队列 | 宿主决定 | protocol / SDK | `sdk-app` |

各层在 dsh 里的对应：编排 → `core/agent-loop`、`workflow/*`、`subagent/*`、`experimental/agent-team`；preset → `preset/*`；触发 → `experimental/webhook`、`schedule/*`、`goal/*`（dsh 只有投工，没有认领）；入口 → `apps/cli`、`sdk/*`、`acp/*`、`api/*` + `client/*`、`apps/desktop`。

## 七条不变量

1. 带工具或会改业务状态的模型调用，一律经过 Agent 和 Session。图节点、子 Agent 各开一条 session，带父 run id 或父 session id。纯计算调用（embedding、打分）可以直接走 `llm/`，但必须经过网关计量和审计。
2. 已记录不等于模型可见。会话事件分两种：模型可见事件推导出模型历史；仅记录事件（渠道展示状态、审批界面状态、反馈、失败的模型尝试）只进日志，永不进入模型历史。渠道只经 session input 提交模型可见的内容，其余只能写仅记录事件。
3. 编排层只调用 Agent，不改 `core/agent-loop`。图执行器、编排者是 loop 的使用者，不是 loop 的变体。
4. 触发层不 import 内核：`queue/*` 只认任务行和租约，接线在 `queue/dispatcher`；`graph/graph-triggers` 只开 run，失败重试归节点级幂等键，不长出租约。
5. 渠道只做翻译，不拥有 prompt 和工具。
6. preset 是带版本的数据：prompt 版本、工具白名单、上限、输出 schema、模型都在里面；prod 只加载已注册的版本。
7. 先落盘再展示，崩溃后不自动重放副作用。
   - 一个 step 以日志里的模型消息、工具开始事件、工具结果事件为准；渠道收到的流式片段只是预览。
   - 工具执行前先写开始事件。恢复时，有开始事件、没有结果的调用补一条「结果未知」的错误结果；没有开始事件的补「未开始」。两种都不自动重新执行。
   - 「结果未知」之后：读工具可以重试；写工具只有声明了幂等键才可以重试，幂等键由业务标识派生（例如任务 id + 目标对象），不由调用 id 派生，因为模型重试会产生新的调用 id；不可逆工具一律停在 `needs_confirm`，由人查外部状态后决定。

内核另守 `../README.md`「跨类型不变的部分」里的八条约束。

### 上下文改写

请求前改写上下文的钩子（对应 dsh 的 `agent/pre-step`、`agent/request`），改动必须能从日志重建：注入写成会话事件，裁剪写成压缩事件，请求头与上下文变化写成请求事件。不采用「每次请求前直接改写上下文、不落日志」的做法（pi 的 `transformContext` 属于此类）：那样事后无法还原模型当时看到了什么，违反「模型可见 ⟺ 已记录」。

---

## 内核仓

`★` 是模板仓 P0 就要建的包；其余只列在地图里，有产品要用时用生成器建。`(dsh 无)` 表示 dsh 没有、按 dsh 命名规则推出来的包。

```text
agent/
├── AGENTS.md                         # 常驻规则；改 packages/<g>/<p> 前先读 dsh 同路径 README
├── docs/
│   ├── architecture.md               # 本篇
│   ├── forms.md                      # 15 种形态 → 要填的位置
│   ├── dsh-map.md                    # 本仓包 ↔ dsh 包，唯一一张对照表
│   └── cookbook/                     # new-product / new-channel / new-tool / new-preset
├── scripts/
│   ├── new-product.ts  new-channel.ts  new-tool.ts  new-preset.ts   ★
│   ├── templates/                    # 生成器模板；测试生成到临时目录再 typecheck
│   └── verify-deps.ts                ★ # 依赖方向检查
├── snapshots/                        ★ # 每个 bundle 一条录制会话回放（= dsh snapshots/）
│
└── packages/
    │  ── 层 0：内核 ──
    ├── core/          session/ system-prompt/ tools/ agent/ agent-loop/          ★
    ├── llm/           llm/ llm-ai-platform/ llm-retry/ token-meter/              ★
    ├── session/       session-persistence/ session-persistence-jsonl/            ★
    │                  session-telemetry/                                         ★
    │                  session-persistence-pg/ session-projection/ session-telemetry-otel/
    ├── compaction/    compaction/ compaction-basic/                              ★
    ├── interaction/   user-approval/ ★  user-questions/ tool-ask-user/
    ├── guard/         limit-policy/ ★ (dsh 无)  timeout-policy/
    ├── spill/         spill/ spill-policy/ spill-object-storage/ (dsh 无)
    ├── attachment/    attachment/ attachment-object-storage/ (dsh 无)
    ├── credentials/   credentials/ credentials-<store>/
    ├── util/          brand/ ★  timeout/
    ├── test-support/  llm-replay/ ★  session-snapshot/ ★  agent-loop-testkit/
    │
    │  ── 层 1：preset 与上下文 ──
    ├── preset/        agent-preset/ agent-preset-registry/                       ★
    ├── skill/         skill/ skill-filesystem/ tool-skill/
    ├── context/       agent-instructions/ time-context/
    │
    │  ── 能力：每个都是 定义 / 实现 / tool 三角色 ──
    ├── web/           web/ web-fetch-http/ web-search-<vendor>/ tool-web/
    ├── fs/            fs/ fs-local/ fs-sandbox/ tool-fs/
    ├── shell/         shell/ bash-local/ bash-sandbox/ tool-bash/
    ├── subprocess/  sandbox/  lsp/
    ├── ptc-runtime/   ptc-runtime/ ptc-runtime-node/             # code mode：模型写程序调工具，只有输出回到上下文
    ├── browser-use/  computer-use/
    ├── mcp/           mcp-client/ mcp-resources/ mcp-server/ (dsh 无)
    ├── deliverables/  tool-present/ workspace-changes/
    │
    │  ── 层 2：编排 ──
    ├── subagent/      subagent/ subagent-spawn-in-process/ tool-subagent/
    ├── graph/         graph/ graph-runner/                       (dsh 无；触发器见层 3)
    ├── team/          orchestrator/ blackboard/                  (dsh 无)
    │
    │  ── 层 3：触发 ──
    ├── queue/         queue/ queue-pg/ dispatcher/               (dsh 无；带租约的认领)
    ├── graph/         graph-triggers/                            (dsh 无；表单 / 日历 / 定时 → 开 run)
    │
    │  ── 层 4：入口 ──
    ├── channel/       channel-web-chat/ ★  channel-widget/ channel-wecom/
    │                  channel-feishu/ channel-voice/             (dsh 无)
    ├── api/           session-controller/                        # 控制台后端：会话列表、entries 推送、input
    ├── client/                                                   # 控制台 / 画布前端
    ├── sdk/           protocol/ server/ client/
    ├── acp/
    │
    │  ── 组合 ──
    └── bundle/
        ├── base/            ★ # 内核 + 共用能力；每个产品的第一层（= dsh-base）
        ├── assistant-app/   ★ # 请求内循环 + 聊天渠道
        ├── worker-app/        # 队列 + dispatcher
        ├── graph-app/         # 图执行器
        ├── team-app/          # 编排者 + 子 Agent
        ├── coding-app/        # fs + shell + sandbox
        └── sdk-app/           # 对外协议
```

单个包照 dsh：`README.md`、`package.json`、`src/index.ts`、`src/types.ts`（只放类型）、`tests/*.spec.ts`、`tests/*.e2e.ts`。包名 `@<scope>/<prefix>-<pkg>`，`<pkg>` 与 dsh 的 `@deepseek-ai/dsh-<pkg>` 同名。每组一个 README，是该组包清单的唯一来源。

## 产品仓

一产品一仓，由 `new-product` 生成，钉内核仓版本升级。

```text
<product>/
├── AGENTS.md                 # 判型结论 + 本产品额外的规则
├── apps/
│   ├── http/                 # 无状态，可多副本
│   ├── worker/               # 有队列时才有
│   └── web/                  # 有控制台时才有
├── packages/
│   ├── <domain>/             # tasks/ presets/ tools/ skills/ evals/
│   ├── integrations/<vendor>/
│   └── compose/              # base + 一个类型 bundle + 渠道 + 领域（对应 dsh profile）
├── snapshots/                # 本产品的录制回放
└── docs/runbooks/            # 运营基线要求的值班手册
```

## 依赖方向

`verify-deps` 守这几条；违反即 CI 失败。

- 渠道只依赖 `core/agent` 和 `core/session`。
- 触发层不 import `core/*`。
- tool 和领域包只依赖能力的定义包，不依赖实现包；只依赖 `core/agent`，不依赖 `core/agent-loop`。
- 只有 `bundle/*` 和产品仓的 `compose/` 依赖实现包。
- `apps/*` 只依赖 `compose/`。
- `integrations/<vendor>` 不依赖 `llm/*` 和 `core/*`。

---

## 起一个新产品

1. **判型**：三问 → 编排 + 触发 → bundle（上文「五类各是哪种组合」）。
2. **选形态**：查 [forms.md](forms.md)，定渠道和额外能力。
3. **生成**：`pnpm new:product <name> --bundle assistant-app --channel web-chat`，产出 `apps/`、`packages/<domain>`、第一个 preset、`compose/`、空 eval 和 snapshot。
4. **第一个 tool 和第一条 eval**：tool 经 `integrations/<vendor>` 调外部系统，副作用声明必填；eval 是 `../README.md`「强制收敛的检验」里那一条。
5. **跑 snapshot，部署**：`apps/http` 多副本；`apps/worker` 带租约、可扇出。

需要的位置在内核仓里还没建时，先在内核仓用 `new-channel` / `new-tool` 建出来，过 conformance 和 snapshot、发版，再回到第 3 步。

## 只建有产品在用的位置

地图不是待办清单。按 `../products/README.md` 已判型的产品，各层的使用情况：

| 产品 | 编排 | 触发 | 入口 |
| ---- | ---- | ---- | ---- |
| AI 客服 | 自由循环 | 人在场 | `channel-widget` `channel-wecom` `channel-voice` |
| 履约管家 | 自由循环 | 人在场 | `channel-web-chat` |
| 销售助手 | 自由循环（业务请求内） | 人在场 | `channel-web-chat` |
| 直播切片 | 固定管道；LLM 节点 = 单步 preset | 队列认领 | 录制回调投工 + `client/` 任务看板与审片 |
| 内容运营工作流 | 图执行器 | `graph/graph-triggers` | `client/` 画布 + 人工节点 |
| AI 能力平台 | 不是 Agent | — | `llm/llm-ai-platform` 背后的网关 |

因此 P0 只建 `★`：内核、preset、`assistant-app`、`channel-web-chat`、`llm-replay`、生成器。`worker-app` 随切片、`graph-app` 随内容工作流开工再建。`team/`、`coding-app`、`sdk/`、`acp/`、CLI / IDE / 桌面 / 浏览器 / 移动端入口没有产品要用，不建。

另外三条：

- 每个 bundle 一条真实组合的 snapshot：能启动，能跑完一条录制会话。手工拼装的单元测试不算。
- 生成器模板被测试覆盖：生成到临时目录后跑 typecheck 和 snapshot。cookbook 是唯一说明来源，生成器产出与 cookbook 一致。
- 模板不是 `examples/`：它是被验证的代码，不是示例。

---

## README 简写 → 落地路径

`../README.md` 各类型的「目录」小节用类型视角的简写，落地时按下表换成本篇的路径。

| README 简写 | 落地路径 |
| ----------- | -------- |
| `telemetry` | `session/session-telemetry` + `session/session-telemetry-otel` |
| `ai` | `llm/llm` + `llm/llm-ai-platform` + `llm/llm-retry` |
| `core` 的 loop / capabilities | `core/agent` + `core/agent-loop` + `core/tools` + `core/system-prompt` |
| `core/src/session` + `session-backends/*` | `core/session` + `session/session-persistence{,-jsonl,-pg}` |
| `core/src/skills` | `skill/*` |
| `core/src/compaction` | `compaction/*` |
| 三上限、停止原因 | `guard/limit-policy` |
| 不可逆动作等确认 | `interaction/user-approval` |
| 通用五件 | `fs/tool-fs`、`shell/tool-bash`、`web/tool-web` |
| `queue` + `dispatcher` | `queue/queue` + `queue/queue-pg` + `queue/dispatcher` |
| `protocol` / `client` / `server` | `sdk/protocol` / `sdk/client` / `sdk/server` |
| `extension-api` | 不建；通用类立项时再定 |
| `app` | 产品仓 `apps/*` + `packages/compose`；组合件在内核仓 `bundle/*` |
| `web` | 产品仓 `apps/web`；共用前端 `client/`，后端 `api/session-controller` |
| `chat` 模块 / `ChatLog` | `channel/channel-web-chat` + `bundle/assistant-app`；`ChatLog` 就是 `core/session` 的会话日志 |
| `<domain>` / `integrations/<vendor>` | 产品仓 `packages/<domain>` / `packages/integrations/<vendor>` |
| `graph` / `runner` / `triggers` | `graph/graph` / `graph/graph-runner` / `graph/graph-triggers` |
| `roles` | 产品仓 `packages/<domain>/presets/`：一个角色一个 preset |
| `orchestrator` / `blackboard` | `team/orchestrator` / `team/blackboard` |
| `evals` | 产品仓 `packages/<domain>/evals` + `snapshots/`；内核仓 `snapshots/` |
