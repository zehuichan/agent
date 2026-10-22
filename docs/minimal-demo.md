# 最小通用 Agent 实现

通用类骨架（[../README.md](../README.md)「通用类 Agent」）收缩到能跑通的最小集：**一个** `core` **库 + 一个 CLI 宿主**。目录用 README 的简写包名，落地路径见 [architecture.md](architecture.md) 末尾的对照表。

本文只定目录、依赖方向和取舍，不写实现。

---

## 定位

- 类型：通用类。三问答案：谁驱动 = 开发者（CLI）；智能住哪 = 库，由 `app` 宿主装配；关掉页面还干不干活 = 不干（没有 server、没有队列）。
- 比通用类 P0 更小：P0 要 `protocol` + `server` + `client` + unix transport + 三种 CLI 模式，这里一个都不建，只留 `print` 和 `interactive`。
- 目的：证明 `core` 能独立跑通一轮 loop，session append-only，上限与停止原因可观测，eval 能当门禁。不是对外产品。

两处和本仓规则的张力，先写明：

1. 本仓规定「不建 demo 仓、不建 `examples/`」（通用类硬规则 9）。所以这里的 demo 就是 `app`：唯一装配点，也是唯一参考实现。
2. 本仓判定「通用类不立产品，`core` 只作各产品共用的库」（[../products/README.md](../products/README.md)）。因此本 demo 不对外承诺契约稳定；要立项做 `protocol` / `server`，先写 `docs/why-not-dsh.md`，写不出来就不往下建。

---

## 目录

- agent/
├── AGENTS.md                        # 边界：智能只在 core；装配只在 app；ai 不知道 agent 存在
├── package.json                     # workspaces: packages/*  packages/session-backends/*
├── tsconfig.base.json
│
├── packages/
│   ├── telemetry/                   # 零依赖契约
│   │   └── src/types.ts             # 每 loop 一条：步数 / token / 时延 / 工具调用 / 停止原因 / 模型版本
│   │
│   ├── ai/                          # 供应商统一层；不 import core
│   │   └── src/
│   │       ├── types.ts             # Message / ToolCall / StreamEvent（与 session 的类型是两套）
│   │       ├── chat.ts              # chat(model, messages, tools) → 流式事件
│   │       └── providers/<one>.ts   # 只接一家；降级、多供应商后置
│   │
│   ├── core/                        # ★ 运行时（库）；无领域词
│   │   └── src/
│   │       ├── loop.ts              # 模型 → tool_start 先落盘 → 执行 → tool_result → 回到模型
│   │       ├── limits.ts            # 步数 / token / 时间；宿主注入，缺配置不启动
│   │       ├── stop-reason.ts       # done | step_cap | token_cap | timeout | killed | needs_confirm
│   │       ├── system-prompt.ts
│   │       ├── capabilities.ts      # tool 注册表；缺能力只减菜单，不抛错
│   │       ├── tools/
│   │       │   ├── types.ts         # schema + 副作用声明（读 / 写 / 不可逆）必填
│   │       │   └── read.ts  write.ts  edit.ts  bash.ts   # 通用件；fetch 后置
│   │       └── session/
│   │           ├── entry.ts         # append-only entry 树；模型可见 / 仅记录 两类
│   │           ├── session.ts       # create / append / getEntries(since)
│   │           ├── backend.ts       # 持久化契约（接口）
│   │           └── conformance.ts   # 任何 backend 都要过
│   │
│   ├── session-backends/
│   │   └── jsonl/                   # 默认且唯一；entry id 当游标
│   │
│   ├── app/                         # ★ 唯一装配点 + 唯一参考实现（bin）
│   │   └── src/
│   │       ├── config.ts            # 模型 + prompt + tool 白名单 + 三上限（preset 的最小形态）
│   │       ├── modes/
│   │       │   ├── print.ts         # agent -p "…"：跑一轮，stdout 出结果
│   │       │   └── interactive.ts   # 最小 REPL，不做 TUI
│   │       └── main.ts              # 读 config → 注入 ai / backend / limits → 起 mode
│   │
│   └── evals/
│       ├── llm-replay.ts            # 实现 ai 的接口：按录制响应回放，无 key 可跑
│       ├── snapshots/               # 一条录制会话 = 门禁
│       └── first/                   # 第一条 eval：fixtures/repo + 改对一个函数
│
├── scripts/
│   └── check-boundaries.ts          # 依赖方向 + core 无领域词 grep
│
└── docs/
    ├── architecture.md
    ├── minimal-demo.md              # 本篇
    └── boundaries.md                # 各包禁止事项

一共 6 个包：`telemetry`、`ai`、`core`、`session-backends/jsonl`、`app`、`evals`。

`llm-replay` 放在 `evals`，不放进 `ai`：`ai` 保持纯供应商层，回放只是测试用的另一个实现。

---

## 依赖方向

```text
app ──▶ core ──▶ ai ──▶ telemetry
 │       │
 │       └──▶ session 契约（core 内）◀── session-backends/jsonl
 └─ 注入 backend / provider / limits
evals ──▶ app + core + ai（只有 evals 能看到全部）
```

`check-boundaries.ts` 守：

- `core` 不 import `session-backends`（具体 backend 由 `app` 注入，所以没有环）。
- `ai` 不 import `core`。
- `tools/*` 只依赖 `tools/types`。
- `core` 里不出现领域词（「线索」「合同」「工单」一类）。
- 只有 `app` 依赖具体实现包。

---

## 一次运行的路径

```text
agent -p "…"
  → app/main：读 config，注入 provider + jsonl backend + 三上限（缺一个就拒绝启动）
  → core.session.create
  → loop：append user entry → ai.chat
      ◇ 有 tool_call？  是 → 先写 tool_start entry → 执行 → 写 tool_result entry → 回模型
      ◇ 不可逆？        是 → 停，stop = needs_confirm
      ◇ 超上限？        是 → 停，stop = step_cap / token_cap / timeout
      否则 → 写 stop = done
  → 发一条 telemetry；print 模式把最后一条 assistant 输出写到 stdout
```

---

## 层 → 目录

| 层 | 落点 | 不做什么 |
| -- | ---- | -------- |
| 契约 | `telemetry` | 零依赖；只放类型 |
| 供应商 | `ai` | 不知道 agent 存在；不 import `core` |
| 编排 | `core/loop` `limits` `capabilities` | 不含领域词；不选传输、不管进程形态 |
| 工具 | `core/tools` | 副作用声明必填；不可逆默认停下 |
| 状态 | `core/session` + `session-backends/jsonl` | append-only；entry id 稳定；不改历史 |
| 装配 / 入口 | `app` | 唯一 import 具体实现的地方；不拥有 prompt 之外的智能 |
| 质量 | `evals` | 测结果，不测措辞；用录制回放，不依赖 key |

---

## 硬规则（最小集）

只留不守就会破坏骨架的几条，都来自 README「跨类型不变的部分」和通用类硬规则：

1. agent 是库；进程形态由 `app` 决定。`core` 不管传输。
2. `core` 无领域词；CI grep 守门。
3. session append-only；entry id 稳定。模型可见 ⟺ 已记录：进 loop 请求的都能从 entries 重建。
4. `tool_start` 先于执行落盘；崩溃后不自动重放副作用（恢复逻辑后置，但事件格式现在就留好）。
5. tool 必填副作用声明（读 / 写 / 不可逆）；不可逆默认停在 `needs_confirm`，聊天里的「好的」不算授权。
6. 三上限（步数 / token / 时间）由宿主注入，缺配置不启动；停止原因显式落 entry。
7. 每 loop 一条 telemetry，带模型版本。
8. `ai` 与 `session` 的类型是两套；转换在 `core` 里显式写，不让一个包的类型漏进另一个。
9. 缺能力只减菜单，不抛错。

---

## 先不建

这些是通用类完整形态里有、但最小实现里没有的位置。每一项都带出现条件，条件没出现就不建（见 [architecture.md](architecture.md)「只建有产品在用的位置」）：

| 不建 | 何时再建 |
| ---- | -------- |
| `protocol` / `server` / `client`、`--rpc` / `--serve` | 出现嵌入者或第二个宿主（= 通用类 P0 的完整形态） |
| `extension-api` | 出现第三方扩展者；需要先写 conformance |
| `queue` / `dispatcher` | 要无人值守、跨进程认领；通用类里它是可选层 |
| `session-backends/sqlite` | 要全文检索或多端读 |
| 崩溃恢复（给「结果未知」的调用补结果） | 有 resume / attach 时 |
| `compaction` | 长会话成为问题；上线时带「保留事实集」回归 |
| `tui` | 终端体验成为问题；与 `core` 无关 |
| `skills`、`fetch` tool | 有明确需求；`fetch` 要先定网络策略 |
| 多供应商、路由、降级 | 接第二家模型时 |

没有 `compaction` 时，超 token 就以 `token_cap` 终止，不静默截断。

---

## 完成线

| 阶段 | 必须能做到 |
| ---- | ---------- |
| M0 | `agent -p "…"` 跑通一轮：`ai` 一家 provider、`core` loop + 四个 tool、jsonl session、三上限与停止原因、telemetry 一条；session conformance 过 |
| M1 | `interactive` 模式；`check-boundaries` 进 CI；`llm-replay` snapshot 当门禁 |
| M2 | 补齐通用类 P0：`protocol` + `server` + `client` + unix transport、`--rpc`（走 [architecture.md](architecture.md) 的 `sdk/*` 路径） |

M2 之前先过本文「两处张力」第 2 条：没有开发者客户，就停在 M1。

---

## 第一条 eval

「在陌生仓库里改对一个函数」。

- `evals/first/fixtures/repo`：一个小仓库，带一个有 bug 的函数和一个现成测试。
- 跑 `agent -p`（用 `llm-replay` 回放录制响应）→ 测试从红变绿，且 tool 调用序列与 snapshot 一致。
- 同一 snapshot 里，在第 N 步触发 `step_cap`：loop 必须在第 N 步停下，stop reason 落 entry，不是异常。

`core` 变更先过这条 snapshot；产品仓钉版本升级（README「跨类型不变的部分」第 7 条）。

---

## 开工顺序

1. `telemetry` 与 `ai` 的类型，加 `evals/llm-replay`。
2. `core/session`（entry、backend 契约、conformance）与 `jsonl`。
3. `core/tools` 与 `limits`，再写 `loop`。
4. `app` 的 `print` 模式。
5. 第一条 eval + snapshot，把整条链跑通。
6. 补 `interactive` 与 `check-boundaries`。

---

## 失败模式

- **偷偷建** `server`**。** 想「顺手」加个 HTTP 或 unix socket，就是在没有第二个宿主时预选了通用类的完整形态。守「先不建」那张表。
- `app` **长出智能。** prompt 拼装、tool 选择、重试写进 `main.ts`。`app` 只装配，智能在 `core`。
- `ai` **类型漏进 session。** entry 直接存供应商的消息格式，换供应商就改历史格式。守规则 8。
- **demo 变成** `examples/`**。** 为了展示再建第二个入口。`app` 是唯一参考实现。
