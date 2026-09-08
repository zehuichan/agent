# ai-platform · AI 能力平台

产品：公司内所有 AI 产品（销售对话数据平台、AI 客服、直播切片、内容工作流、履约管家）共用的**能力平台**：模型网关、检索服务、用户事实存储、Prompt 注册。谁在用：业务仓只拿 project key；平台组看成本 / 时延 / 错误率；合规看谁把什么分级的数据送去了哪家供应商。

本仓类型：**不是五类之一**。回答「能力从哪来、花了多少、合不合规」，不回答「谁驱动」。对应 README 跨类型不变的 `telemetry` / `ai`，外加计量、预算、审计、数据分级。业务 Agent 各自判型，只消费这一层。

不要建成第六类产品，不要建成多 Agent（没有 `roles/` `blackboard/`），不要在这里放 loop 或 dispatcher。

---

## 不能照搬的原型做法

「多项目共享一层 AI 能力」的原型通常长这样：几个本地端口上的 MCP Server（LLM 网关 / RAG / 记忆 / Prompt），前面一个 HTTP 网关做 API Key、日志、每日 token 配额；业务侧把召回、画像、RAG、Prompt、LLM、记忆、抽事实串成一条固定流水线。下面是不能照搬的部分。

| 原型做法 | 问题 | 替代 |
| -------- | ---- | ---- |
| 内部服务之间用 MCP（Streamable HTTP） | MCP 是给外部 Agent 客户端发现与调用工具的协议；内部 RPC 用它多一层连接管理、少一层类型 | 内部 = HTTP / gRPC + OpenAPI + SDK；MCP 只作**对外适配层**（给 Cursor / Claude / 员工桌面 Agent） |
| 本地文件向量库 + 内置小 embedding 模型 | 单机、无版本、无隔离保证、中文效果差 | pgvector / Milvus / ES 混合检索 + rerank；集合按租户 × 项目隔离；集合版本发布 / 回滚；embedding 模型钉在集合上 |
| SQLite 对话记忆按 project + session | 对话记忆属于产品 session，不该在平台 | 平台不存对话；只存**用户事实**（画像），带来源、TTL、同意依据 |
| 用户画像跨项目默认共享（客服里说的过敏信息 → 推荐项目直接用） | 个保法目的限定：为客服目的收集的信息不能默认用于推荐 | 跨项目共享默认关；白名单 + 法律依据记录；写入需产品声明同意来源 |
| 「AI 识别到新事实就写画像」 | 默认抽事实写画像没有告知同意 | 抽事实是产品侧显式功能，带告知；平台只提供带审计的存取 |
| YAML Prompt + MCP Prompt 原语 | 无版本、无环境、无回归 | Prompt 注册：版本、环境（dev / staging / prod）、灰度、绑定 eval |
| API Key 写 `config.yaml` | | 密钥库；按 project × 环境签发；轮换；供应商 key 只在平台 |
| 配额 = 每日 token 数 | | 预算（钱）+ 速率 + 并发；80% 告警、100% 限流或降级，策略可配；showback 报表 |
| 只接一家模型供应商 | | 多供应商；路由 / 降级 / 重试 / 超时；每家供应商标注境内外、DPA、可接收的数据分级 |
| RAG 服务内部直连 embedding API | 绕开计量口 | 检索服务经 `ai` 包 embed，同一计量口 |

---

## 运营要求（按本目录 README 的运营基线填）

- **SLO**：网关 p95 附加时延 < 50ms；可用性目标；供应商故障自动降级并告警。
- **数据分级与放行**：业务项目声明每次调用的数据分级（公开 / 内部 / 已脱敏客户数据 / 原文）；网关按分级 × 供应商放行表决定可路由到哪家；原文一律不出境。
- **日志**：请求 / 响应留存脱敏、按项目分级（有的项目禁止留正文）；保留期；审计日志只追加。
- **成本**：按 project / tenant / 模型每日汇总；预算策略可配；成本异常（单 trace 超阈值）告警。
- **变更**：模型版本升级走灰度 + 各业务回归集；检索集合换 embedding 走双写切换；prompt 走环境晋升。
- **值班**：供应商 5xx 激增、预算耗尽、集合发布失败、密钥即将过期——各配 runbook。

---

## 技术栈（按 README 层填）

| 层 | README 落点 | 本项目选型 |
| -- | ----------- | ---------- |
| 契约 | `telemetry` | trace、用量事件、分级标签；conformance |
| 供应商 | `packages/ai` | chat / embed / rerank / image；多供应商；路由、降级、结构化输出；不知道 agent |
| 网关 | `packages/gateway` | 对业务的 HTTP：认证、分级放行、预算、审计、路由 |
| 检索 | `packages/retrieval` | 集合、版本、ingest 管道（分块策略）、混合检索 + rerank、golden set eval |
| 事实 | `packages/facts` | 用户事实：来源、TTL、同意、跨项目白名单 |
| Prompt | `packages/prompt-registry` | 版本、环境、灰度、绑定 eval |
| 对外 | `packages/mcp-adapter` | 把网关能力暴露为 MCP Tool；仅外部 Agent 客户端 |
| SDK | `packages/sdk` | 业务仓的 `packages/ai` 就是它（ts / py） |
| 存储 | PostgreSQL + pgvector（或 Milvus）、对象存储 | 无 SQLite、无本地文件 |
| 明确不建 | `core` `queue` `orchestrator` `roles` | 共享层不认领、不拆角色、不跑 loop |

---

## 目录

```text
ai-platform/
├── AGENTS.md                       # 无领域；不知道「客服」「切片」
├── packages/
│   ├── telemetry/                  # 零依赖契约 + conformance
│   ├── ai/                         # ★ 供应商统一层
│   │   └── src/
│   │       ├── chat.ts             # 多模型、降级、流式、结构化输出
│   │       ├── embed.ts  rerank.ts  image.ts
│   │       ├── providers/          # 每家：境内外、DPA、可接收分级、限流
│   │       └── models.ts           # 模型目录 + 版本
│   │
│   ├── gateway/                    # ★ 对业务的 HTTP；不是 Agent loop
│   │   └── src/
│   │       ├── http/               # /v1/chat /v1/embed /v1/retrieve /v1/facts /v1/prompts
│   │       ├── auth/               # project key、环境、允许的分级
│   │       ├── classification/     # 分级 × 供应商放行表
│   │       ├── budget/             # 预算、速率、并发；策略
│   │       ├── audit/              # 脱敏日志、留存、只追加
│   │       └── routing/            # 分级 + 策略 → 供应商与模型
│   │
│   ├── retrieval/                  # 集合、版本、ingest、混合检索、rerank、golden set
│   ├── facts/                      # 用户事实；来源 / TTL / 同意 / 白名单
│   ├── prompt-registry/            # 版本、环境、灰度、eval 绑定
│   ├── mcp-adapter/                # 对外 MCP；import gateway client，不 import core
│   └── sdk/                        # ts / py client；业务仓依赖它
│
├── evals/
│   ├── retrieval/                  # 集合 golden set recall@k；发布门禁
│   ├── routing/                    # 降级、预算、分级放行
│   └── redaction/                  # 日志脱敏用例
│
└── docs/
    ├── data-classification.md      # 分级定义与供应商放行表
    ├── embedding.md                # 业务怎么接：只拿 project key
    └── why-not-direct-sdk.md       # 不直连模型的理由：计量、密钥、换模型、分级
```

业务仓（示例，助手类，**不在本目录长 loop**）：

```text
customer-service/
└── packages/
    ├── ai/                         # = ai-platform/sdk；不要再造一份
    ├── core/
    ├── integrations/knowledge/     # 调 /v1/retrieve，带集合版本
    └── app/src/http/chat.ts
```

---

## 层 → 目录

| 层 | 落点 | 不做什么 |
| -- | ---- | -------- |
| 供应商 | `ai` | 不知道 session、不知道任务、不知道租户业务 |
| 网关 | `gateway` | 不跑 loop、不 enrich 业务、不存对话 |
| 检索 | `retrieval` | 不知道文档业务含义；集合版本不可变 |
| 事实 | `facts` | 不存对话；不默认跨项目 |
| Prompt | `prompt-registry` | 不渲染业务逻辑；只管版本与环境 |
| 对外 | `mcp-adapter` | 不承载内部流量 |
| 业务 Agent | 外仓 | 无状态编排；召回 / 画像 / RAG / 记忆怎么串是业务配方，不写进 `ai` |

---

## 硬规则（本项目）

1. 业务仓无供应商 key；每次调用带 project、环境、trace、数据分级。缺分级拒绝。
2. `ai` 不知道 agent 存在；平台无 loop、无 dispatcher、无 `roles`。
3. 检索集合版本不可变；embedding 模型钉在集合上；发布过 golden set；回滚 = 切版本。
4. 平台不存对话；用户事实带来源 / TTL / 同意依据；跨项目共享默认关，开启需白名单 + 依据。
5. 日志脱敏分级；留存期；禁止留正文的项目就是不留。
6. 模型升级灰度 + 业务回归集；不静默切模型；模型版本进每条用量事件。
7. 原文分级不出境；放行表是配置且有 eval。
8. MCP 只是适配层；内部调用不走 MCP。

---

## 完成线

| 阶段 | 必须能对外提供 |
| ---- | -------------- |
| P0 | `gateway` 的 `/v1/chat` `/v1/embed`：认证、分级放行、用量事件、脱敏审计；`ai` 两家供应商 + 降级；`sdk`；第一个业务仓接入 |
| P1 | `retrieval` 集合版本 + golden set 门禁；预算策略；`prompt-registry` 版本与环境；看板 |
| P2 | `facts` 与白名单；`mcp-adapter`；模型灰度流程；成本 showback |
| P3 | 第二区域 / 私有化部署的供应商；语义缓存（可选） |

---

## 第一条 eval

同一 prompt 两次 chat → 用量记到同一 project、同一 trace 链、同一模型版本；某集合 golden set recall@5 ≥ 上一版本才允许发布；标记「原文」分级的请求不会路由到任何境外供应商；供应商 A 返回 5xx 时请求落到 B 且审计标明降级。

## 换型

无。谁消费它，谁判垂直 / 助手 / 工作流。
