# 本仓 ↔ dsh

参考系是 [dsh](https://github.com/deepseek-ai/deepseek-harness)。本仓不引入 Cordis 容器，只借 dsh 的服务划分、规则和包路径。规则只有一条：**职责相同，用同名同路径；职责不同，不借 dsh 的名字。** 改 `packages/<group>/<pkg>` 前，先读 dsh 同路径的 `README.md`；标「dsh 无」的包以本仓文档为准。

---

## 借什么，不借什么

借：

- 五个核心服务的划分：`core/session`、`core/system-prompt`、`core/tools`、`core/agent`、`core/agent-loop`。
- 能力三角色：定义 / 实现 / 使用方，三者齐全才算一个可插点。
- step / turn 两层循环，以及循环上的拦截点：`preStep`、`request`、`stream`、`tools.preExecute` / `execute` / `postExecute`、`turnStopping`、`approval.request`。每个拦截点是有序中间件链，调用 `next()` 往下传，不调用即截断（dsh 的 waterfall 语义）。
- 模型可见 ⟺ 已记录；反过来，已记录不等于模型可见：仅记录事件（例如失败的模型尝试 `assistant/attempt`）只进日志，不进模型历史。会话事件表可扩展，读取方对未知类型走 `default`，带 `ignorable: true` 的才可跳过。
- 崩溃恢复不自动重放副作用：有开始记录、没有结果的工具调用补一条「结果未知」的错误结果，只允许重试只读或幂等的操作；可能有副作用的先查外部状态或问人（dsh `core/agent-loop` README）。
- 会话格式版本号与相邻迁移；迁移只追加新文件，不覆盖、不删除旧文件；SQL 用单调递增的 `SCHEMA_VERSION`。
- `register()` 返回 disposer；默认值显式写成 `resolve(request): Spec`；可调参数是校验过的 `Config`；配置错误在加载时报错；跨边界 id 用 branded 类型。
- 无 key 的录制会话回放当门禁（dsh `test-support/llm-replay` + `snapshots/`）。

不借：

- Cordis 容器（`ctx.<key>` 服务查找、`inject`、effect 回收）。本仓用构造注入，产品组合写成代码。
- profile / bundle 的 yml 叠加、HMR、插件市场、isolate realm。
- Host / Client 双端编译、typert、Web GUI、桌面端。
- 「只经 `dsh --profile` 启动」：本仓内核是普通库，可以跑在业务请求里。
- 本地优先的 JSONL Harness home；默认装 bash。

---

## 包对照

| 本仓 | dsh | 职责 |
| ---- | --- | ---- |
| `core/session` | `core/session` | 只追加的会话日志；`seq` 单调递增，可当游标；推导模型历史 |
| `core/system-prompt` | `core/system-prompt` | 每个 step 收集 prompt 片段和工具 schema |
| `core/tools` | `core/tools` | 工具注册；前置策略 → guard → 执行 → 后置策略 |
| `core/agent` | `core/agent` | `Agent` 接口与拦截点；扩展只依赖它 |
| `core/agent-loop` | `core/agent-loop` | 唯一的循环实现 |
| `llm/llm` | `llm/llm` | 适配器定义；循环和压缩只调与供应商无关的流式服务 |
| `llm/llm-ai-platform` | `llm/llm-deepseek` 的位置 | 能力平台网关适配器（dsh 无） |
| `llm/llm-retry` `llm/token-meter` | 同名 | 重试；token 计量 |
| `session/session-persistence` | 同名 | 持久化接口；单写者句柄 |
| `session/session-persistence-jsonl` | 同名 | 开发与测试 |
| `session/session-persistence-pg` | — | 生产后端（dsh 无） |
| `session/session-projection` | 同名 | 从日志折叠出的状态；重连时 `snapshot()` 对齐 |
| `session/session-telemetry` `-otel` | 同名 | 会话遥测接口与 OTel 导出 |
| `compaction/compaction` `compaction-basic` | 同名 | 压缩接口与基础实现；替换以日志事件记录，不删历史 |
| `interaction/user-approval` | 同名 | 审批；没有应答方时拒绝 |
| `interaction/permission-presets` | 同名 | 把沙箱模式和审批策略打包成预设 |
| `interaction/user-questions` `tool-ask-user` | 同名 | 向人提问（「补充信息」） |
| `guard/timeout-policy` | 同名 | 工具执行时限 |
| `guard/limit-policy` | — | 步数 / token 上限 + 停止原因（dsh 无） |
| `spill/*` | `spill/*` | 超长工具输出转存；`spill-object-storage` 对应 dsh 的 `spill-local` |
| `attachment/*` | `attachment/*` | 图片、语音、文件；`attachment-object-storage` 对应 dsh 的 `attachment-local` |
| `credentials/*` | `credentials/*` | 凭证引用；值由实现方持有 |
| `preset/agent-preset` `agent-preset-registry` | 同名 | 按会话组合能力集；带版本 |
| `skill/*` `context/*` | 同名 | skill 目录与加载；模型可见的请求上下文 |
| `web/*` `fs/*` `shell/*` `subprocess/*` `lsp/*` | 同名 | 可选能力；只给需要的宿主装配 |
| `sandbox/*` | 同名 | 三种模式 `read-only` / `workspace-write` / `danger-full-access`；各平台后端（Linux bwrap 再 Landlock、macOS Seatbelt、Windows restricted token）；被拒的调用经用户批准可一次性提权。只做同宿主限制：容器、microVM 级隔离是换掉整个能力的实现，不挂在这里 |
| `ptc-runtime/*` | 同名 | code mode：模型写的程序调工具；子调用照走工具管线并记日志，只有打印或返回的内容回到上下文 |
| `browser-use/*` `computer-use/*` | 同名 | 浏览器 / 桌面操作；dsh 的实现在 `experimental/` |
| `mcp/mcp-client` `mcp-resources` | 同名 | 把外部 MCP server 接成工具 |
| `mcp/mcp-server` | — | 把本仓 Agent 暴露成 MCP server（dsh 无） |
| `deliverables/*` | 同名 | 交付物：文件、工作区变更 |
| `subagent/*` | 同名 | 委派子 Agent |
| `graph/*` | — | 图定义、执行器、触发器（dsh 无） |
| `team/*` | `experimental/agent-team` 可参考 | 编排者与黑板（dsh 无同名包） |
| `queue/*` | — | 任务行、租约、`claimDue`、dispatcher（dsh 无） |
| `channel/*` | — | 渠道适配器（dsh 无） |
| `api/session-controller` | 同名 | 控制台后端：会话命令、读取、事件推送 |
| `client/` | `client/*` | 控制台 / 画布前端 |
| `sdk/protocol` `server` `client` | 同名 | 进程外协议 |
| `acp/` | `acp/acp` | ACP 接入 |
| `bundle/base` | `bundle/base` | 各产品共用的第一层组合 |
| `bundle/*-app` | `bundle/web-app` `headless` `sdk-app` `acp-app` | 类型组合；本仓是 TS 组合函数，不是 yml |
| `test-support/llm-replay` `session-snapshot` `agent-loop-testkit` | 同名 | 录制回放与测试工具 |
| `util/brand` `util/timeout` | 同名 | branded id、超时 |

## 不借名的 dsh 包

这些名字在 dsh 里已有不同职责，本仓不用：

| 本仓的东西 | 不叫 | dsh 里这个名字是什么 | 本仓名 |
| ---------- | ---- | -------------------- | ------ |
| 垂直类任务队列 | `jobs` | 进程内后台任务注册表，例如后台 bash | `queue/*` |
| 定时投工 | `schedule` | 往已有会话里排一条消息，不开新任务 | 垂直类：`queue/*` 写任务行；工作流类：`graph/graph-triggers` 开 run |
| 回调投工 | `webhook` | 验签后直接开会话，不写任务行，无重试无去重 | 产品仓 `apps/http` → `queue/*` |
| 工作流图与执行器 | `workflow` | PTC 脚本引擎，`agent()` 调用经子 Agent 分发 | `graph/*` |
| 多 Agent 编排者 | `subagent` | 委派一个子任务的可插点 | `team/orchestrator` |
| 业务 HTTP 接口 | `api` | 给 Web GUI 用的远程 BFF | 产品仓 `apps/http` |

## 通用类用到的会话概念

`../README.md`「通用类 Agent」里的会话概念，在 dsh 里的对应：

| 概念 | dsh 对应 | 本仓 |
| ---- | -------- | ---- |
| entry id 当游标，跨重启续读 | 会话事件的 `seq`（`seq = log.length`） | 沿用 |
| 压缩、fork 不删历史 | 压缩以替换事件记入日志；fork 在 turn 边界新建会话，记 `parentSession` | 沿用 |
| 会话租约 exclusive | 持久化句柄单写者：同一会话第二次写打开抛 `SessionAlreadyOwnedError`，跨进程有写 lease | 沿用 |
| 会话租约 shared | 无 | 本仓设计 |
| attach 后 snapshot 对齐 | `session/session-projection` 的 `snapshot()` + `api/session-controller` 推送已落盘事件 | 沿用 |
| 帧协议 | `sdk/protocol`：JSON-RPC over stdio | 沿用 |
| 认领（`claimDue`） | 无：dsh 有投工，没有认领 | 本仓设计 |
