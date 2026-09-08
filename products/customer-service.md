# customer-service · AI 客服（文本渠道 + 转人工 + 知识运营闭环）

产品：接在企业已有客户触点上的客服 Agent——微信客服 / 企微客服、网页与小程序客服窗——回答商品 / 课程 / 订单问题；答不了按**策略**转人工；人工补的答案经审核、过回归、发布进知识库版本，形成可回滚的知识运营闭环。谁在用：客户问，坐席接转人工，知识运营清「未命中问题」队列，质检抽检。语音（App 语音咨询、电话）是它的一个渠道，见文末「渠道：语音」。

本仓类型：**助手类 · 独立部署变体**。宿主（商品目录、订单、工单 / 坐席系统）在别的进程，聊天框就是产品。用户不再发消息就停。转人工是写操作，但它建的是宿主系统的工单或转接，不是本仓的任务表。

三问：人驱动 · 请求内 · 用户不发就停。

---

## 不能照搬的原型做法

这类产品的原型通常长这样：单进程、Mock 模型、内存向量库、一个页面演示「答不上 → 转人工 → 入库 → 下次答对」。下面是不能照搬的部分。

| 原型做法 | 问题 | 替代 |
| -------- | ---- | ---- |
| Mock LLM，「换真模型只换 Provider」 | 真模型有超时、限流、幻觉；Mock 跑不出这些 | 经能力平台网关：超时、降级、备用模型；回归集用**录制的真模型响应** |
| 内存 / 本地向量知识库 | 重启丢；单实例；无版本 | 能力平台检索服务的集合 + 版本；发布 / 回滚 |
| 聊天页与审核台同进程、单用户 | 多副本、多租户都没位置 | 渠道 webhook（微信客服 / 企微）+ 网页 widget；HTTP 多副本无状态；session 在 PostgreSQL |
| 「答不上就转人工」由模型决定 | 不可控、不可解释、不可审计 | 转人工策略是代码：无命中 / 低相关 / 敏感话题（退款、投诉、医疗金融承诺）/ 用户要求 / 非工作时间 → 留资工单 |
| 人工答案「通过并入库」立刻生效 | 无版本、无回归、错了不能回滚 | 草稿 → 审核 → 回归集通过 → 发布版本；每条答案记来源工单 |
| 看板只有「知识条目↑ 转人工率↓」 | 看不出客户是否被解决 | 解决率、转人工率、知识命中率、满意度、坐席平均处理时长；按渠道 / 租户切 |
| 无身份，任意订单可查 | | 渠道身份（openid / unionid / 企微 external_userid）↔ 客户账号绑定；未绑定先验证（手机验证码 / 已登录透传） |
| 商品 / 订单是内存假数据 | | `integrations/catalog` `orders` 是宿主系统 API client；缺 key 只减菜单 |

---

## 运营要求（按本目录 README 的运营基线填）

- **渠道规则**：微信客服 / 企微客服的回复时间窗与条数限制是平台规则；webhook 重推要幂等（消息 id）；消息乱序按时间戳合并。
- **坐席**：企业已有客服系统（企微客服工作台 / 第三方坐席）→ 转人工 = 调它的转接 API，附对话摘要与已查信息；没有才建最小 `apps/agent-console`。先问清，不默认自建。
- **合规**：首条消息声明 AI 客服身份；对话记录保留期；日志脱敏；禁答清单（价格承诺、疗效、收益）走固定话术；用户消息是数据不是指令（注入防护）。
- **可靠**：模型不可用或超时 → 直接转人工 / 留资，不空回复、不静默；每次回答带知识版本 + prompt 版本 + chunk ids，可追溯可回放。
- **质检**：每日抽样 N 条人审打分；未命中问题聚类进知识运营队列；满意度回收。
- **告警**：转人工率突增、知识命中率跌、渠道 webhook 失败率、模型错误率——各配 runbook。

---

## 技术栈（按 README 层填）

| 层 | README 落点 | 本项目选型 |
| -- | ----------- | ---------- |
| 供应商 | `ai` | 能力平台 SDK；无供应商 key；结构化输出用于策略判定 |
| 编排 | `core` | 请求内 loop；步数上限；停止原因落 entry |
| 状态 | `session-backends/postgres` | 多副本；会话 + entries + ChatLog |
| 外部系统 | `integrations` | `wecom-kf`（微信客服 / 企微）、`web-widget`、`catalog`、`orders`、`identity`、`ticketing`、`knowledge` |
| 策略 | `app/src/policy` | 转人工、禁答、工作时间——代码，不是 prompt |
| 装配 | `app` | `POST /api/chat`（widget）+ 渠道 webhook 进同一 `chat.service` |
| 体验 | `web` | widget 与嵌入脚本；没有业务表单 |
| 知识运营 | `apps/knowledge-ops` | 未命中队列 → 草稿 → 审核 → 回归 → 发布 / 回滚 |
| 质量 | `evals/regression` `evals/redteam` | 发布门禁 |
| 不装 | `queue` `dispatcher` `schedules` | 转人工不是认领后台任务 |

---

## 目录

取 README「助手类 · 独立部署变体」。

```text
customer-service/
├── AGENTS.md
├── packages/
│   ├── telemetry/
│   ├── ai/                         # 能力平台 SDK；不知道工具名
│   ├── core/                       # 请求内 loop；步数上限
│   ├── session-backends/postgres/
│   ├── integrations/
│   │   ├── wecom-kf/               # 微信客服 / 企微客服：收消息、发消息、转接坐席；不知道 LLM
│   │   ├── web-widget/             # 网页 / 小程序接入协议
│   │   ├── catalog/                # 商品 / 课程目录
│   │   ├── orders/                 # 订单；按绑定身份查
│   │   ├── identity/               # 渠道 id ↔ 客户账号绑定与验证
│   │   ├── ticketing/              # 工单 / 已有坐席系统转接
│   │   └── knowledge/              # 能力平台检索集合（客服集合，按租户）
│   ├── app/src/
│   │   ├── http/
│   │   │   ├── chat.ts             # POST /api/chat；流式
│   │   │   └── webhooks/wecom.ts   # 验签、去重、入会话、回消息
│   │   ├── policy/
│   │   │   ├── handoff.ts          # 转人工规则
│   │   │   ├── deny-list.ts        # 禁答话题 → 固定话术 / 转人工
│   │   │   └── hours.ts            # 工作时间 → 转坐席 / 留资
│   │   ├── tools/
│   │   │   ├── knowledge-search.ts # 读
│   │   │   ├── product-lookup.ts   # 读
│   │   │   ├── order-query.ts      # 读；要求已绑定身份
│   │   │   └── handoff.ts          # 写；幂等键 = 会话 id；附摘要
│   │   ├── prompts/                # 版本来自能力平台 prompt 注册
│   │   └── chat-log/               # kb_version、prompt_version、chunk ids、policy 命中、停止原因
│   └── web/                        # widget 与嵌入脚本
│
├── apps/
│   ├── knowledge-ops/              # 知识运营：未命中问题队列、草稿、审核、回归、发布、回滚
│   └── agent-console/              # 仅当企业没有坐席系统；否则不建
│
├── evals/
│   ├── regression/                 # 真实问题 → 期望 chunk id / 期望 handoff；知识版本与 prompt 版本发布门禁
│   └── redteam/                    # 注入、禁答、越权查单
│
└── docs/runbooks/
```

技能菜单 = `tools/` 四个文件。`knowledge-ops` 是业务 CRUD，不调模型、不跑 loop；它发布的版本下次请求内被 `knowledge-search` 命中——仍是助手类。

---

## 层 → 目录

| 层 | 落点 | 不做什么 |
| -- | ---- | -------- |
| 体验 | `web` widget + 渠道 | 不拥有知识 CRUD |
| 领域 | 七个 integrations | 不知道 loop |
| 策略 | `app/policy` | 不调模型；模型可建议不可决定 |
| 聊天 | `app/http` | 不拥有调度；不长 cron |
| 工具 | `app/tools` | 只经 integrations；身份透传 |
| 状态 | session + ChatLog | 可回放；无 AgentTask |
| 知识运营 | `apps/knowledge-ops` | 不自动入库；不绕过回归 |
| 质量 | `evals` | 测命中与策略，不测措辞 |

---

## 硬规则（本项目）

1. 身份绑定优先于订单：`order-query` 无绑定即拒并返回验证流程；不用服务账号代查。
2. 转人工由 `policy` 决定；模型输出只作为策略输入之一。
3. 每次回答记 `kb_version` + `prompt_version` + chunk ids + policy 命中；任意一条对话可回放。
4. 知识入库三段：草稿 → 审核 → 回归通过 → 发布。没有「AI 自动入库」；每条知识记来源工单。
5. webhook 幂等（消息 id）；乱序按时间戳；重推不重复回复。
6. 模型失败进 handoff / 留资并落 entry，不空回复。
7. 日志脱敏；对话保留期 job；禁止留正文的租户就不留。
8. 首条声明 AI 身份；禁答清单固定话术。
9. 语音渠道复用本仓 `chat.service`、tools、policy，不复制；见文末。

---

## 完成线

| 阶段 | 必须能对外提供 |
| ---- | -------------- |
| P0 | 一个渠道（微信客服或 widget）端到端；`knowledge-search` + eval；`handoff` 到已有坐席系统并附摘要；ChatLog 齐；首条 AI 声明 |
| P1 | `product-lookup` `order-query` + 身份绑定；`policy` 三件；知识运营队列 → 发布 / 回滚；回归集当门禁 |
| P2 | 第二渠道（语音，见下）；红队集；质检抽样流程；租户隔离；看板 |
| P3 | 无。想主动触达 → 换垂直类 |

---

## 第一条 eval

回归集 50 条真实问题 → 期望 chunk id 命中率 ≥ 0.9；一条知识库没有的规格问题（例：某型号能翻越多高的门槛）→ `policy.handoff` 命中，工单带摘要，模型不编造。知识运营把答案发布为新版本后，同一问句 `knowledge-search` 命中该条，回答带新 `kb_version`。

## 换型信号

「主动回访」「催单」「唤醒沉睡客户」「积压工单凌晨催审核员」→ 垂直类外呼 / 跟进 Agent，有 `queue` 与任务类型。不在这里加 cron、不在 loop 里 sleep。

---

## 渠道：语音

形态：App / 小程序「语音咨询」和经云呼叫中心接进来的电话。ASR → 大脑 → TTS 的媒体链路可以买（云厂商的实时对话式 AI 托管链路），**大脑必须是本仓的**：托管链路的 LLM 指向我们的 `voice/turn`，它调同一个 `chat.service`、同一套 tools 与 policy。这是渠道，不是第二个产品；挂断就停。

厂商 Demo 直接拿来用，不能照搬的部分：

| 原型做法 | 问题 | 替代 |
| -------- | ---- | ---- |
| 在厂商的场景配置里选模型、填 prompt | 大脑在厂商侧：工具、策略、知识都不在我们手里；两个渠道两套 prompt | 托管链路「自定义 LLM URL」指向 `voice/turn`；或自组 ASR / TTS，中间仍是 `chat.service` |
| 服务端只做 token 签发 | 无身份、无租户、无并发控制 | token 由本仓签发：绑定客户身份、租户、会话；每租户并发上限 |
| 关页面即断，无记录 | 无录音、无转写、无质检 | 每通：录音对象存储指针 + ASR 转写 + ChatLog；保留期；质检抽样 |
| 只处理弱网 | 模型慢就沉默 | 时延预算：TTFT 超预算先播「正在为您查询」；超时进 handoff / 留言 |

新增目录（其余一份都不加）：

```text
packages/channels/voice/
├── volc-rtc/                   # 托管链路：签 token、开 / 关房、事件回调；不知道 LLM
├── telephony/                  # 云呼叫中心 SIP / IVR（P2）
└── turn.ts                     # ASR 文本 → chat.service → 文本流 → TTS；打断处理
packages/app/src/http/voice/
├── session.ts                  # 鉴权、并发、录音告知、开房
├── turn.ts                     # 「自定义 LLM」回调入口
└── events.ts                   # 挂断 / 异常 → 关会话、落录音指针
evals/voice/                    # 转写 fixture → 命中 / handoff；p95 TTFT 门禁
```

语音专属硬规则：

1. 浏览器 / App 无密钥；token 短期、绑定身份与会话。
2. 首句录音告知；查订单前验证身份（已登录透传或验证码）；语音里的「嗯」「好」不算授权。
3. 打断不丢副作用：读 tool 可丢，`handoff` 幂等。
4. 时延预算是发布门禁（staging 固定音频回放，p95 TTFT < 1.5s）；超时进固定话术 + handoff / 留言，不沉默。
5. 缺 ASR / TTS 供应商只减语音渠道，不打挂文本渠道。

语音 eval：fixture 音频（含口语噪声）→ 转写 → `knowledge-search` 命中与文本渠道同一 chunk；「我要投诉」→ `policy.handoff` 命中并附摘要。

换型信号同上：外呼（回访 / 催费 / 唤醒）→ 垂直类外呼 Agent，不在渠道里加定时器。
