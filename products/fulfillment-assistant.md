# fulfillment-assistant · 履约管家（订单状态 + 交付周期 + 交付知识）

产品：给 DM / PM 用的对话型助手（需求文档 2026-09-03）。问三件事：某订单的当前状态与历史、某品类发某国的交付周期、交付流程知识。谁在用：DM / PM 在页面上问一句答一句；交付团队的知识运营归档、审核、发布交付知识；规则表的维护方给交付周期。

本仓类型：**助手类 · 独立部署变体**。宿主是订单系统和交付知识库，都在别的进程；聊天框就是整个产品。三个 tool 全是读，没有 approve 流程。

三问：人驱动 · 请求内 · 关页面停。

取：`ai`、`core`（请求内 loop、步数上限、流式）、postgres session（侧栏有「历史」，P0 就要）、三个 tool、`integrations/orders` 与 `integrations/knowledge`。不建：`queue`、`dispatcher`、approve 流程。从 `customer-service.md` 直接取：身份透传优先于订单查询、策略是代码、每次回答记知识版本与 chunk id、模型失败进固定应答不沉默。

---

## 三个 tool 的难点都不在 agent 侧

- `order.query(orderId)`：先问清订单系统是什么，agent 侧只是一个 integration。
- `delivery.estimate(category, destination)`：需求写的是「基于算法」，是确定性计算，LLM 只做槽位抽取和措辞。算法住 tool 里不进 prompt；「品类 × 目的国 → 天数」的规则表谁给、谁维护要先定。单元测试即 eval。
- `knowledge.search(query)`：依赖一个还不存在的知识库——需求自己写了「部分未经系统性归档，仅依赖经验口口相传」。归档先于 agent，三个里最重：先按 `sales-data-platform.md` 的路子归档成**版本**，再挂到能力平台检索集合上，而不是先写 tool。

UI 上的「技能」是三个 tool 的菜单入口；「专家」需求文档里没有，要问。

---

## 不能照搬的原型做法

| 原型做法 | 问题 | 替代 |
| -------- | ---- | ---- |
| sqlite session（首版草案） | 单写者、单机、无备份；多副本没位置 | `session-backends/postgres`；会话 + entries + ChatLog |
| 交付周期让模型「按经验」答 | 天数是幻觉高发区；不可解释、不可回归 | 确定性计算住 `delivery-estimate`；规则表是版本化数据；LLM 只抽槽位、组措辞；抽不出槽位就追问 |
| 交付知识没归档就上 `knowledge.search` | 没有 chunk 可命中，模型只能编 | 归档 → 审核 → 发布版本先行；tool 只读已发布版本；未命中进队列 |
| 任意 orderId 可查 | 无身份，越权看别人的订单与客户信息 | 登录身份透传给订单系统，由它鉴权；不用服务账号代查；访问日志 |
| 供应商 key 写 `.env`，订单原文直发模型 | 无计量、无降级；客户信息出边界说不清 | 只经能力平台网关（`ai-platform.md`）；订单字段按分级决定进不进 prompt |
| 订单系统慢 / 挂就让模型「先答着」 | 编出一个状态 | 固定应答 + 落 entry；不沉默不编造 |

---

## 运营要求（按本目录 README 的运营基线填）

- **身份与权限**：企微 / SSO 登录；`order-query` 用登录者身份调订单系统，订单系统按自身权限模型决定能不能看；每次订单查询记访问日志（谁、哪个订单、何时）。
- **合规**：订单里的客户联系方式、地址属客户数据，按分级处理——不进 prompt 或只送放行的供应商；对话与日志脱敏、有保留期。
- **版本**：交付知识库版本、prompt 版本、交付周期规则表版本三者都进 ChatLog；发布过 eval；回滚 = 切版本。
- **可靠**：订单系统 / 知识库 / 模型任一超时或不可用 → `policy.fallback` 固定应答（「订单系统暂时不可用」「知识库里没有这条」），落 entry；不空回复、不沉默、不编造。
- **知识运营**：未命中问题进队列 → 归档草稿 → 审核 → 回归 → 发布版本；规则表变更同样走版本与审核，维护方要先定。
- **可观测与告警**：三个 tool 各自的调用量 / 失败率 / 时延、知识命中率、未命中队列长度、模型错误率、成本 / 天；订单 integration 失败率突增、知识命中率跌、模型错误率——各配 runbook。

---

## 技术栈（按 README 层填）

| 层 | README 落点 | 本项目选型 |
| -- | ----------- | ---------- |
| 供应商 | `ai` | 能力平台 SDK；无供应商 key；结构化输出用于槽位抽取 |
| 编排 | `core` | 请求内 loop；步数上限；流式；停止原因落 entry；不装配 bash |
| 状态 | `session-backends/postgres` | 侧栏有「历史」，P0 就要；会话 + entries + ChatLog |
| 外部系统 | `integrations` | `orders`（订单系统：状态、历史）、`knowledge`（能力平台检索集合：交付知识） |
| 领域计算 | `app/src/rules` | 品类 × 目的国 → 天数；版本化数据 + 确定性函数；不进 prompt |
| 策略 | `app/src/policy` | 依赖不可用时的固定应答——代码，不是 prompt |
| 装配 | `app` | 登录 + `POST /api/chat` 流式 |
| 体验 | `web` | 聊天页：新会话 / 历史 / 技能菜单；没有业务表单 |
| 知识运营 | `apps/knowledge-ops` | 交付知识：未命中队列 → 草稿 → 审核 → 发布 / 回滚；形态同 `customer-service.md` |
| 质量 | `evals` | 三个 tool 各一组；发布门禁 |
| 不装 | `queue` `dispatcher` `schedules` approve 流程 | 三个 tool 全是读 |

---

## 目录

取 README「助手类 · 独立部署变体」。

```text
fulfillment-assistant/
├── AGENTS.md
├── packages/
│   ├── telemetry/
│   ├── ai/                         # 能力平台 SDK；不知道工具名
│   ├── core/                       # 请求内 loop；步数上限；不装配 bash
│   ├── session-backends/postgres/
│   ├── integrations/
│   │   ├── orders/                 # 订单系统 API client：当前状态、历史；身份透传；不知道 LLM
│   │   └── knowledge/              # 能力平台检索集合（交付知识，只读已发布版本）
│   ├── app/src/
│   │   ├── http/
│   │   │   ├── auth.ts             # 企微 / SSO 登录；身份进请求上下文
│   │   │   └── chat.ts             # POST /api/chat；流式
│   │   ├── tools/
│   │   │   ├── order-query.ts      # 读；orderId → 当前状态 + 历史；身份透传
│   │   │   ├── delivery-estimate.ts # 读；(category, destination) → 天数；调 rules，不调模型
│   │   │   └── knowledge-search.ts # 读；只查已发布版本
│   │   ├── rules/
│   │   │   └── delivery-days.ts    # 品类 × 目的国 → 天数；版本化；单元测试即 eval
│   │   ├── policy/
│   │   │   └── fallback.ts         # 订单系统 / 知识库 / 模型不可用 → 固定应答
│   │   ├── prompts/                # 版本来自能力平台 prompt 注册
│   │   └── chat-log/               # kb_version、prompt_version、rules_version、chunk ids、停止原因
│   └── web/                        # 聊天页：新会话 / 历史 / 技能菜单
│
├── apps/
│   └── knowledge-ops/              # 交付知识归档：未命中队列、草稿、审核、发布、回滚
│
├── evals/
│   ├── order-query/                # 订单 X 状态与订单系统一致
│   ├── delivery-estimate/          # 规则表用例；槽位抽取 fixture
│   └── knowledge-search/           # 真实问题 → 期望 chunk id
│
└── docs/runbooks/
```

技能菜单 = `tools/` 三个文件。`knowledge-ops` 是业务 CRUD，不调模型、不跑 loop；它发布的版本下次请求内被 `knowledge-search` 命中——仍是助手类。没有 `queue/`、没有 dispatcher、没有 `schedules.ts`。

---

## 层 → 目录

| 层 | 落点 | 不做什么 |
| -- | ---- | -------- |
| 体验 | `web` | 不拥有业务表单；技能菜单从 `tools/` 生成 |
| 领域 | 两个 integrations | 不知道 loop |
| 领域计算 | `app/rules` | 不进 prompt；不调模型 |
| 策略 | `app/policy` | 不调模型 |
| 聊天 | `app/http` | 不拥有调度；不长 cron |
| 工具 | `app/tools` | 只经 integrations / rules；身份透传；全是读 |
| 状态 | session + ChatLog | 可回放；无 AgentTask |
| 知识运营 | `apps/knowledge-ops` | 不自动入库；不绕过审核 |
| 质量 | `evals` | 测状态一致、天数正确、chunk 命中；不测措辞 |

---

## 硬规则（本项目）

1. 身份透传优先于订单查询：`order-query` 以登录者身份调订单系统，鉴权在订单系统；不用服务账号代查；每次查询记访问日志。
2. 交付周期是确定性计算：算法与规则表住 `rules` / `delivery-estimate`，不进 prompt；模型只抽槽位和组措辞，抽不出就追问，不猜。规则表变更走版本，`rules_version` 进 ChatLog。
3. `knowledge-search` 只读已发布版本；回答带 `kb_version` + chunk ids；没命中就说没有并进未命中队列，不编造。
4. 归档先于 tool：交付知识库没有第一个已发布版本，`knowledge-search` 不上线。
5. 三个 tool 全是读。出现写动作先回判型，不在这里加 approve 流程。
6. 订单系统 / 知识库 / 模型任一失败进 `policy.fallback` 固定应答并落 entry，不空回复、不沉默。
7. 每次回答记 `kb_version` + `prompt_version` + `rules_version` + chunk ids + 停止原因；任意一条对话可回放。
8. 客户联系方式、地址不进 prompt；日志脱敏；对话保留期 job。
9. 不装配 bash；不建 `queue` / `dispatcher` / `schedules`。

---

## 完成线

| 阶段 | 必须能对外提供 |
| ---- | -------------- |
| P0 | 登录 + `POST /api/chat` 流式；请求内 loop 带步数上限；`order-query` 端到端 + eval；身份透传；会话持久化（历史侧栏）；ChatLog；`policy.fallback` |
| P1 | `delivery-estimate` + 规则表 + 单元测试；交付知识库第一个已发布版本 → `knowledge-search` + eval；技能菜单从 `tools/` 生成；未命中队列 |
| P2 | `knowledge-ops` 审核 → 发布 / 回滚闭环；回归集当门禁；看板与三条告警；分级与脱敏抽检 |
| P3 | 无。想主动通知、预警 → 换垂直类 |

---

## 第一条 eval

订单 X 查回来的状态与订单系统一致：以订单系统同一时刻的接口返回为 golden，当前状态、历史条目数与顺序全部一致；无权限的登录者查同一订单被拒且落访问日志。后两个 tool 各自的第一条：`delivery-estimate` 规则表用例全部命中；`knowledge-search` 回归集问题命中期望 chunk id，回答带 `kb_version`。

## 换型信号

「订单状态变了主动通知 DM」「承诺交付日前 N 天预警」→ 垂直类，加 `queue` 与任务类型，不加 cron、不在 loop 里 sleep。
