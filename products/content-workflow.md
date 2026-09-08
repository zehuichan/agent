# content-workflow · 内容运营工作流

产品：一个自媒体矩阵（多个小红书 / 公众号 / 视频号账号）的内容工作流：选题来自素材库、热点与销售异议数据；写稿；**合规审核**（广告法绝对化用语、平台限流词、医疗金融承诺）；人审；配图（生图带 AI 标识，或素材库实拍）；排期；发布（官方接口或人工节点）；数据回收反哺选题。谁在用：运营出稿、审核放行、主管看排期与成本。

本仓类型：**工作流类**。图是内容负责人定的，LLM 只在节点里填空，人审是一等节点。买的是可回放、可审计的流程，不是聊天框，也不是任务类型列表。

三问：表单 / 内容日历 / 定时触发 · 智能在节点里 · run 绑版本跑到结束，关页面靠 checkpoint 续。

不要做成多 Agent：选题 / 写手 / 画师不是 `roles/`，是节点。不要做成垂直类：失败重试是节点级 + 幂等键，不在 `triggers` 里发明租约。

---

## 不能照搬的原型做法

这类产品的原型通常长这样：LangGraph 单图写在代码里，一个主题字串进去，选题 → `interrupt` 选题 → 写稿 → `interrupt` 审稿 → 抽视觉点 → 生图，PG checkpointer，模型直连。下面是不能照搬的部分。

| 原型做法 | 问题 | 替代 |
| -------- | ---- | ---- |
| 图写在代码里 | 改流程要发版；不同账号不能有不同流程 | 图是版本化数据（`graph.yaml`）；runner 只加载已发布版本；LangGraph 可作 `compile` 目标 |
| 一个主题字串当 brief | 没有素材、没有账号人设、没有历史数据 | brief = 账号人设 + 素材引用 + 近期数据 + 禁忌；选题节点读结构化输入 |
| 审稿只有 approve / reject | 没有合规 | 合规节点：确定性词表 + 规则（广告法、限流词）+ LLM 解释；不过则回写稿 |
| 生图直接用 | 版权、AI 生成内容标识规定 | 生图节点写显式标识与元数据；素材库实拍优先；图片来源与授权记录 |
| 直连单一模型、无计量 | | 经能力平台；轻 / 旗舰路由在 `ai`；每 run 记成本 |
| 无排期、无发布 | 图跑完稿子在数据库里 | 排期节点写内容日历；发布节点 = 官方接口或 `human`（人工发布并回填链接） |
| 无角色 | | 写手 / 审核 / 主管；审核节点按账号分配 |
| 无数据回收 | 不知道哪种选题有效 | 定时触发的 `collect-metrics` 工作流：拉阅读 / 互动 → 写回素材库 → 选题节点可读 |
| 驳回后回到写稿节点无上限 | | 重写次数是图上的 `loop` 上限；超限进 human |

---

## 运营要求（按本目录 README 的运营基线填）

- **平台规则**：不模拟客户端发帖；只用官方开放接口或人工发布；批量注册 / 养号不在产品范围。
- **AI 标识**：《人工智能生成合成内容标识办法》（2025-09-01 起施行）要求显式标识；生图与生成文案发布时带标识，标识方式记在 run 上。
- **版权**：素材库记录来源与授权；生图记录模型、prompt、时间。
- **成本**：每篇 LLM + 生图费用；run 预算超限暂停等人，不是异常。
- **审计**：谁选题、谁审核、谁发布、发布链接；run 全回放。
- **告警**：待审积压、发布失败、生图重试耗尽、数据回收断线——各配 runbook。
- **多账号**：账号人设、词表、发布渠道、审核人是账号配置；同一图版本服务多个账号。

---

## 技术栈（按 README 层填）

| 层 | README 落点 | 本项目选型 |
| -- | ----------- | ---------- |
| 供应商 | `packages/ai` | 能力平台 SDK：文案 + 生图；轻 / 旗舰路由在这里，节点不写厂商 |
| 图定义 | `packages/graph` | DSL + 节点类型 + `compile`；LangGraph 是一种 compile 实现，**图仍是数据** |
| 执行 | `packages/runner` | 按边走；一步一 checkpoint；节点级重试；成本累计 |
| 触发 | `packages/triggers` | 表单 / 内容日历 / 定时（`collect-metrics`）；不长成 `queue` |
| 状态 | `packages/store` | PostgreSQL：workflow 版本、run、step、审批记录、成本 |
| 流程资产 | `workflows/*` | `graph.yaml` + prompts + fixtures，版本化 |
| 体验 | `packages/web` | 日历、待办（选题 / 审稿 / 发布）、run 回放；画布编辑 P2 |
| 质量 | `workflows/*/fixtures` | 改图 / 改 prompt 必须过；测结构化产出，不测文采 |

SSE 只服务 LLM 节点的 token 预览；写入 checkpoint 的仍是节点完整输出。

---

## 目录

取 README 工作流类。

```text
content-workflow/
├── packages/
│   ├── telemetry/
│   ├── ai/                         # 文案 + 生图；不知道「小红书」
│   │
│   ├── graph/                      # ★ 不执行、不 import runner
│   │   └── src/
│   │       ├── schema.ts
│   │       ├── nodes/
│   │       │   ├── llm.ts          # 选题 / 写稿共用类型；prompt 在流程资产里
│   │       │   ├── tool.ts         # 生图、发布、排期、拉数据
│   │       │   ├── branch.ts
│   │       │   ├── loop.ts         # 重写上限
│   │       │   ├── human.ts        # 选题 / 审稿 / 人工发布；一等节点
│   │       │   └── code.ts         # 合规词表与规则、抽视觉要点等确定性步骤
│   │       └── compile.ts          # yaml → 可执行图；端口静态检查
│   │
│   ├── runner/
│   │   └── src/
│   │       ├── run.ts
│   │       ├── checkpoint.ts
│   │       ├── retry.ts            # 节点级；幂等键 =（run, node, 输入 hash）
│   │       └── budget.ts           # run 成本预算；超限暂停
│   │
│   ├── triggers/                   # 表单 / 日历 / 定时 → 开 run
│   ├── store/                      # workflow 版本、run、step、审批、成本
│   ├── integrations/
│   │   ├── image-gen/              # 生图；写 AI 标识元数据；不知道 LLM 编排
│   │   ├── asset-library/          # 素材库：实拍图、直播切片、销售异议摘要（来自其他产品）
│   │   ├── compliance-lexicon/     # 词表与规则，版本化
│   │   ├── publish-xhs/            # 小红书官方接口（有权限时）；否则 human 发布
│   │   ├── publish-wechat/         # 公众号接口
│   │   └── metrics/                # 平台数据拉取
│   ├── app/                        # API：发布图版本 / 触发 / 查 run / 投 human 输入 / 日历
│   └── web/                        # 日历、待办、回放；画布编辑 P2
│
├── workflows/
│   ├── content-ops/
│   │   ├── graph.yaml              # 触发→选题LLM→human选→写稿LLM→合规code→◇→human审→配图tool→排期→发布(tool|human)
│   │   ├── prompts/                # 版本化；按账号人设参数化
│   │   └── fixtures/               # brief 样例 + 期望：选题数 / 合规拦截 / 配图张数与标识
│   └── collect-metrics/
│       ├── graph.yaml              # 定时→拉数据→写素材库
│       └── fixtures/
│
└── docs/runbooks/
```

`graph.yaml` 边是人连的。`human` 节点暂停等「过 / 驳回 / 改选题 / 已发布并回填链接」，续跑从 checkpoint，不重跑整图。

---

## 层 → 目录

| 层 | 落点 | 不做什么 |
| -- | ---- | -------- |
| 图定义 | `graph` | 不执行；不 import `runner` |
| 节点 | `graph/src/nodes` | 无状态；输出过 schema |
| 执行 | `runner` | 不 import `workflows/*` |
| 触发 | `triggers` | 只开 run；不认领、不跨进程 backoff |
| 状态 | `store` + checkpoint | run 绑定 vN；append-only |
| 流程资产 | `workflows/*` | 是数据不是代码 |
| 外部系统 | `integrations/*` | 不出现在 prompt；发布只走官方接口 |
| 体验 | `web` | 不跑节点、不直接调生图 |

---

## 硬规则（本项目）

1. `runner` 不 import 具体流程；只加载已发布版本；跑中 run 绑版本。
2. LLM 节点输出过 schema（选题数组、稿件结构、视觉要点）；下游不解析散文。
3. 合规节点是确定性门：词表 + 规则先判，LLM 只解释与建议改法；不过则回写稿，重写次数受 `loop` 上限。
4. 一步一 checkpoint；生图失败只重放生图节点；幂等键 =（run, node, 输入 hash）。
5. 发布前必有 `human` 审；AI 生成内容带标识；发布只走官方接口或人工节点。
6. 节点无状态；账号人设、素材、词表都从图状态 / integrations 进来。
7. 改 `graph.yaml` / prompt 版本 / 词表版本必须过 fixtures。
8. 成本预算是 run 属性；超预算暂停等人。
9. 想「失败三点再试、多机分摊」→ 换垂直类 `queue`，别在 `triggers` 里写租约。

---

## 完成线

| 阶段 | 必须能对外提供 |
| ---- | -------------- |
| P0 | `content-ops` 一个账号端到端：brief → 选题 → human → 写稿 → 合规 → human → 配图（带标识）→ human 发布回填；fixtures；run 回放 |
| P1 | 多账号配置；排期与日历；官方发布接口（有权限的渠道）；成本预算；三条告警 |
| P2 | `collect-metrics` 工作流与素材库回写；词表版本管理；画布编辑器 |
| P3 | 无 |

---

## 第一条 eval

`sample-brief.json` 回放到人审前：选题数组长度与 schema 符合 fixture；含违禁词的 fixture 稿件被合规节点拦截并回写稿；配图张数与标识字段齐。

## 换型信号

让 LLM 节点输出「下一步重写还是配图」再 branch → 图不是人画的，换垂直类。运营要「随便问问选题建议」→ 那是助手类聊天框，另立入口，不塞进图里。
