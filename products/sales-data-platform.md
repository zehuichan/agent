# sales-data-platform · 销售对话数据平台

产品：一个销售团队（几十到几百个销售，用企业微信跟客户聊）的**对话数据资产平台**。持续接入会话，无人值守地脱敏 / 切分 / 预标注 / 打分进审核队列，人审之后沉淀成两样可交付物——**已发布的知识库版本**（供销售助手、AI 客服检索）和**带血缘的训练数据集版本**（供微调）。谁在用：销售看自己的复盘，标注员清队列，管理员审导出，合规查访问日志。

本仓类型：产品本体是数据后台，**不是 Agent 产品**。里面的聊天框（销售助手）是 **助手类 · 同进程**。接入与清洗管道是**无人值守的批处理**：LLM 只在节点里出结构化结果，不选工具、不定下一步——它属于领域模块，用 job 表和租约跑，但不开 Agent session，不是 README 的 `queue` / `dispatcher`。

三问（销售助手）：人驱动 · 业务 API 进程内 · 关页面停。
三问（管道）：存档拉取 / 定时驱动 · 领域 job runner · 没人看也跑——但它是 ETL，不是 Agent。

---

## 不能照搬的原型做法

这类产品的原型通常长这样：读一台电脑上的聊天库、手点清洗、SQLite、导出 JSON。下面是不能照搬的部分。

| 原型做法 | 问题 | 替代 |
| -------- | ---- | ---- |
| 解密个人微信本地 SQLite | 一台电脑一个人的数据；随微信版本失效；合法性基础说不清 | 企业微信**会话内容存档**：企业开通、员工授权、客户侧有存档提示；SDK 按 `seq` 游标拉取，企业私钥解密。工作手机 / SCRM 厂商作为第二来源 |
| 「一键清洗」按钮 | 人不点就不跑；跑一半关页面就断 | 接入与清洗是 job：幂等键 =（账号，seq 区间）；可重跑；失败进死信；积压告警 |
| SQLite 默认 | 多标注员并发就锁；无备份策略 | PostgreSQL + pgvector；每日备份 + 恢复演练 |
| API 进程内跑本地 embedding 模型 | 小模型中文效果差；embedding 吃 API 进程 CPU | embedding 经能力平台（`ai-platform.md`）；模型版本钉在检索集合上 |
| 模型 key 写 `.env`，聊天原文直发 | 客户原文出企业边界；无委托处理协议；无计量 | 只经能力平台网关；**脱敏门之后**才允许出去；数据分级决定可用供应商 |
| 硬编码时间过滤 | 只处理一段时间的数据 | 接入策略配置化：账号范围、时间范围、群聊是否纳入 |
| 无登录无角色 | 谁都能导出原文 | 企微扫码登录；角色：销售 / 标注员 / 审核员 / 管理员 / 合规 |
| 导出直接下载 JSON | 无审批、无留痕、无版本 | 导出 = 数据集版本发布：审批、血缘、审计日志、水印字段 |
| 顺手加的素材库 / 学员 / 考核模块 | 与数据资产管道混在一个后台里 | 业务真要再作为独立领域模块；不与数据资产管道混 |

---

## 运营要求（按本目录 README 的运营基线填）

- **合法性基础**：员工知情同意（入职 / 企微授权）、客户告知（企微存档提示）、目的限定（销售培训与质检）。写进 `compliance/` 的配置与文档。
- **数据分区**：`raw`（存档原文，只追加，加密，最小访问面）→ `staging`（已脱敏）→ `labeled` → `published`（知识库版本、数据集版本）。**原文只在 raw**，任何离开 raw 的路径都过脱敏门。
- **删除权**：客户 / 员工要求删除 → 级联标记 raw / staging / labeled / knowledge chunk；含该数据的数据集版本标记「受污染」，禁止再导出；已发布知识库版本发补丁版本。
- **保留期**：raw 按合规期限配置；到期 job 物理删除并留删除记录。
- **审计**：谁看了哪条原文、谁导出了哪个版本、谁改了分类；访问日志只追加。
- **可观测**：接入延迟（存档 seq 落后量）、清洗失败率、审核积压、LLM 花费 / 天、脱敏漏检抽检结果。
- **值班**：接入断线（企微 SDK 报错）、审核积压超阈值、脱敏抽检发现漏检——三条告警各有 runbook。

---

## 技术栈（按 README 层填）

| 层 | README 落点 | 本项目选型 |
| -- | ----------- | ---------- |
| 体验 | `apps/web` + `chat-widget` | React；页面按角色：我的会话 / 审核台 / 知识库版本 / 数据集 / 合规 / 管理 |
| 领域 | `api/modules/*` | `ingest` `pipeline` `review` `knowledge` `datasets` `compliance` `identity` |
| 聊天 | `api/modules/chat` | 销售助手：`POST /api/chat` 流式；只读已发布知识库版本 |
| 供应商 | `packages/ai` | 能力平台 SDK（chat / embed / prompt）；本仓无供应商 key |
| 状态 | PostgreSQL | `raw_messages`（append-only）`conversations` `labels` `kb_versions` `dataset_versions` `chat_logs` `access_logs` |
| 批处理 | 领域 job runner | PG job 表 + 租约（机制同 `claimDue`，但只跑 ETL 节点，不开 Agent session）；`apps/api` 多一个 `worker` 入口跑 pipeline |
| 接入 | `workers/ingest-wecom` | 企微存档官方 SDK 有 Python 绑定，拉取 / 解密用 Python 进程；只写 raw |
| 存储 | 对象存储 | 存档里的文件 / 图片 / 语音只留证不进训练；导出包 |
| 不装 | Agent 意义上的 `queue` `dispatcher` | 没有 Agent 任务类型 |

API、pipeline、chat 都是 TypeScript；只有企微 SDK 拉取是 Python。两者之间只有 raw 表这一条边界。

---

## 目录

取 README「助手类 · 同进程」：左边完整数据后台，右边后加 `chat`。

```text
sales-data-platform/
├── AGENTS.md
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── my-sessions/        # 销售：只看自己的会话与复盘
│   │   │   ├── review/             # 标注员 / 审核员：队列、认领、抽检
│   │   │   ├── knowledge/          # 知识库版本：发布 / 回滚 / 版本对比
│   │   │   ├── datasets/           # 数据集版本：血缘、导出审批
│   │   │   ├── compliance/         # 删除请求、访问日志、保留期
│   │   │   └── admin/              # 接入账号范围、管道配置、告警
│   │   └── components/
│   │       └── chat-widget.tsx     # ★ 销售助手；删掉它左边仍完整
│   │
│   └── api/src/
│       ├── main.ts                 # http 入口（无状态、多副本）
│       ├── worker.ts               # job 入口：认领 pipeline / compliance job；独立部署单元
│       └── modules/
│           ├── identity/           # 企微登录、角色、数据范围
│           ├── ingest/             # 接入状态：账号范围、seq 游标、断线告警；不拉数据
│           ├── pipeline/           # 无人值守：脱敏 → 切分 → 预标注 → 评分 → 入审核队列
│           │   ├── jobs/           # job 定义；幂等键 =（账号，seq 区间）；死信
│           │   ├── redact/         # 手机号 / 身份证 / 卡号 / 地址 / 姓名；回归用例集
│           │   ├── segment/        # 时间窗 + 话题切分
│           │   └── prelabel/       # LLM 结构化输出：分类 / 质量分 / 摘要；过 schema
│           ├── review/             # 队列、认领、双人抽检、SLA
│           ├── knowledge/          # chunk → 版本 → 发布到能力平台检索集合
│           ├── datasets/           # 版本、血缘、格式转换（ShareGPT / Alpaca / OpenAI）、导出审批
│           ├── compliance/         # 删除级联、保留期 job、访问日志
│           └── chat/               # ★ 销售助手；与业务模块平级
│               ├── chat.controller.ts  # POST /api/chat；流式
│               ├── chat.service.ts     # 请求内 loop；步数上限
│               ├── prompts/            # 版本来自能力平台 prompt 注册
│               ├── tools/
│               │   ├── knowledge-search.ts   # 读；只查已发布版本
│               │   └── my-session-recap.ts   # 读；只读本人会话；经 identity 校验
│               └── chat-log/           # 记 kb_version、chunk id、tool 调用
│
├── workers/
│   └── ingest-wecom/               # Python：企微存档 SDK 拉取、解密；只持有 raw 的 INSERT 角色
│
├── packages/
│   ├── ai/                         # 能力平台 SDK
│   ├── db/                         # 上述表；raw 用独立连接角色，只有 INSERT / SELECT
│   ├── shared/
│   └── telemetry/
│
└── docs/
    ├── data-zones.md               # raw / staging / labeled / published 边界与放行规则
    ├── lawful-basis.md             # 合法性基础、告知文案、删除流程
    └── runbooks/                   # 接入断线、积压、脱敏漏检
```

识别：没有 Agent 任务类型入口；`pipeline/jobs` 是 ETL 不是认领后开 session；问答入口是输入框。

---

## 层 → 目录

| 层 | 落点 | 不做什么 |
| -- | ---- | -------- |
| 体验 | `apps/web` 各角色页 + `chat-widget` | 聊天框不拥有审核 / 导出路由 |
| 领域 | `ingest` `pipeline` `review` `knowledge` `datasets` `compliance` | 不知道聊天存在；权限在 `identity` |
| 接入 | `workers/ingest-wecom` + `modules/ingest` | 只写 raw；不脱敏、不切分（那是 pipeline 的事） |
| 管道 | `pipeline/*`，由 `worker.ts` 认领执行 | 不开 Agent session；不调 tools；不碰 published |
| 聊天 | `api/modules/chat` | 不拥有调度；不读 raw；不在 tool 里跑清洗 |
| 工具 | `chat/tools` | 只 import 领域 service；全是读；身份透传 |
| 状态 | `chat_logs` | 记 kb_version + chunk id；没有任务、没有 run |
| 质量 | 管道 eval + 助手 eval | 测脱敏漏检、分类准确率、命中条目；不测「像不像销售」 |

---

## 硬规则（本项目）

1. 原文只在 raw。raw 用独立数据库角色，`pipeline/prelabel` 与 `chat` 不持有该角色的连接；CI 用依赖图守：这两个模块不 import raw 仓储。
2. 脱敏是回归用例集，不是正则清单。每类 PII 一组用例；漏检 = 阻断发布。
3. 数据集版本不可变、带血缘（版本 ← labeled ids ← raw ids）；导出需审批 + 审计；含删除请求数据的版本禁导出。
4. 知识库先发布再被检索。`chat` 只读已发布版本 id，回答带 `kb_version`；回滚 = 切版本。
5. 管道 job 幂等（账号 + seq 区间），失败重跑不重复；LLM 节点输出过 schema，失败进死信不静默丢。
6. `chat` 不拥有调度；`ingest` / `pipeline` 的定时属于领域模块。
7. 身份透传：`my-session-recap` 只读本人；管理员看下属需明确授权并记访问日志。
8. 供应商 key 不在本仓；送往模型的文本必须来自 staging 之后。
9. 保留期与删除级联是产品功能，有 job、有记录、有 eval。

---

## 完成线

| 阶段 | 必须能对外提供 |
| ---- | -------------- |
| P0 | 企微存档接入一个账号 → raw；脱敏 + 切分 job；审核台一条队列；知识库版本发布一次到能力平台；`chat` 一个 tool（`knowledge-search`）+ eval；访问日志 |
| P1 | 预标注 + 质量分；数据集版本 + 导出审批 + 血缘；删除级联；三条告警 + runbook；角色齐 |
| P2 | 双人抽检；脱敏漏检抽样流程；知识库版本对比 eval；多账号范围；`my-session-recap` |
| P3 | 无。想要「自动给销售发复盘、自动建跟进」→ 另立垂直类产品 |

---

## 第一条 eval

- 管道：脱敏用例集 100% 命中；预标注在 golden set 上分类准确率 ≥ 0.85（阈值随数据调，写进 CI）。
- 助手：问「客户说太贵怎么回」，命中已发布版本里的异议类 chunk，回答携带 `kb_version`；不出现任何 raw 区原句。

## 换型信号

「每天早上给每个销售推昨日复盘并自动生成跟进任务」→ 垂直类独立产品（销售跟进 Agent）：投工 = 定时器，任务类型 = `daily-recap`，有 `queue` 与 session。不在 `chat` 里加 cron，也不塞进 `pipeline`——pipeline 不开 session、不调工具。
