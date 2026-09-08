# live-clipping · 直播自动切片

产品：电商 / 知识付费团队每天几场直播，回放自动处理：拉源 → 抽音 → 中文 ASR → 切段打分 → 边界精修 → 服务端渲染（字幕、封面、竖版）→ 运营审片 → 入素材库 / 发布。运营不看 6 小时回放，只审 AI 给的 10–20 条。谁在用：运营审片，主管看成本与产出，值班处理卡住的任务。

本仓类型：**垂直类**。投工来自直播录制回调 / 上传 / 定时拉取；关页面继续；入口是任务类型 `highlight-clips`，不是聊天框。内部执行是**固定步骤的管道**（LLM 在打分 / 标题节点里出结构化结果），不是自由选工具的 loop——README 允许工作流作为垂直类内部组织方式；P0 不装配 `core` 的 loop。

三问：系统投工 · 独立 worker 进程 · 关页面继续。

---

## 不能照搬的原型做法

这类产品的原型通常长这样：浏览器里用 FFmpeg.wasm 抽音、传一份小音频给 API、境外 Whisper 转写、LLM 打分、再在浏览器里裁切打包；API 和后台 runner 一个进程，文件落本地盘。下面是不能照搬的部分。

| 原型做法 | 问题 | 替代 |
| -------- | ---- | ---- |
| 浏览器 FFmpeg.wasm 当算力（抽音、裁切） | 用户必须开着页面；不能批量、不能夜间跑；大文件浏览器崩 | 渲染在服务端 worker 池；浏览器只上传 / 预览 / 审 |
| GB 视频 multipart 传到 API 进程 | API 进程吃带宽与磁盘 | 预签名直传对象存储；或直播云录制回调直接落 OSS，不经过上传 |
| 境外 Whisper 托管服务 | 数据出境；中文带货口语准确率与限流不可控 | 国内 ASR（火山 / 阿里 Paraformer / 腾讯）带时间戳与说话人分离；或自托管 FunASR |
| API + 数据库轮询 runner 同进程串行 | 重启丢进度、单机、不能扩 worker | `queue`（PG 任务表 + `FOR UPDATE SKIP LOCKED` 租约）+ 独立 worker 部署；每步幂等可续 |
| `./storage` 本地盘 | 无生命周期、无多机共享 | 对象存储；源片 / 中间产物 / 切片三种保留期 |
| SSE 由 runner 直推 | worker 与前端耦合 | 进度 = session entries；web 拉 `GET /v1/sessions/:id/entries?since=` |
| 无租户、无配额、无成本 | | 租户配额（分钟 / 月）；每任务成本（ASR 分钟、LLM token、渲染 CPU 分钟） |
| 「爆款标题」「剪辑思路」直接展示 | 没有合规与人审就出去 | 标题过合规词表；发布前人审；AI 生成内容标识 |
| 「复制时间点到剪辑软件」 | 手工闭环 | 服务端出成片；时间码导出只是可选格式 |

---

## 运营要求（按本目录 README 的运营基线填）

- **SLO**：6h 回放 → 片段清单 ≤ 60 min；渲染完成 ≤ 90 min；超时告警。
- **卡住任务**：租约过期自动回队；`attempts` 超限进死信，值班看 runbook。
- **存储成本**：源片 7 天、中间音频 3 天、切片 90 天（配置）；清理 job 是产品的一部分。
- **版权与平台**：只处理自家直播；发布走官方开放接口（抖音 / 视频号）或人工发布节点；不模拟客户端。
- **可复现**：ASR 模型版本、LLM 模型版本、打分 SOP 版本钉在任务上；换供应商先跑 eval。
- **安全**：预签名 URL 短期；下载切片需登录；对象存储按租户前缀隔离。
- **看板**：每租户每场直播成本、产出条数、审片通过率、各步骤耗时分布。

---

## 技术栈（按 README 层填）

| 层 | README 落点 | 本项目选型 |
| -- | ----------- | ---------- |
| 契约 | `telemetry` | 任务进度、各步骤耗时与成本 |
| 供应商 | `ai` | 能力平台 SDK（打分 / 标题，结构化输出）；不知道切片 |
| 编排 | `core` | P0 不装配；将来「按品牌要求重剪」的自由 loop 才需要 |
| 队列 | `queue` ★ | PG 任务表；`claimDue` + `SKIP LOCKED`；backoff；死信；不 import `core` / `slice` |
| 领域 | `slice` | 任务类型、步骤、SOP、eval |
| 外部系统 | `integrations` | `asr` `ffmpeg` `object-storage` `live-recording` `publish` |
| 装配 | `app` | `http`（无状态多副本）与 `worker`（dispatcher，可扇出）两个部署单元 |
| 体验 | `web` | 任务看板、审片（选 / 改标题 / 调边界 → 投 input）、成本 |
| 状态 | `session-backends/postgres` | 认领即开 session；步骤事件 = entries |
| 质量 | `slice/evals` | 固定转写 fixture → 时间窗与标注区间 IoU |

Agent 侧 TypeScript；ASR / ffmpeg 步骤是 Python worker；两者只通过任务表与对象存储通信。

---

## 目录

取 README 垂直类，`<domain>` = `slice`。

```text
live-clipping/
├── AGENTS.md
├── packages/
│   ├── telemetry/
│   ├── ai/                         # 能力平台 SDK；不知道切片
│   ├── core/                       # P0 不装配
│   ├── session-backends/postgres/
│   │
│   ├── queue/                      # ★ 任务表 + 租约 + backoff + 死信；不 import core / slice
│   │   └── src/
│   │       ├── task.ts             # { id, tenant, spec: { type, payload }, runAt, leaseUntil, attempts, cost }
│   │       ├── claim.ts
│   │       ├── backoff.ts
│   │       └── dead-letter.ts
│   │
│   ├── slice/                      # ★ 领域包
│   │   └── src/
│   │       ├── tasks/
│   │       │   └── highlight-clips.ts   # 步骤序列、完成判据（≥N 条带时间窗）、成本预算、超时
│   │       ├── steps/                   # 一步一文件；幂等键 =（task, step, 输入 hash）；输出落对象存储
│   │       │   ├── fetch-source.ts      # URL / 录制回调 → 源片入对象存储
│   │       │   ├── extract-audio.ts     # 媒体步：写子任务行给 workers/media，等结果对象出现
│   │       │   ├── transcribe.ts        # 媒体步：同上；ASR 供应商与版本钉在子任务上
│   │       │   ├── segment.ts           # 句边界 + 静音 + 话题
│   │       │   ├── score.ts             # LLM 结构化打分；分批；去重合并
│   │       │   ├── refine-bounds.ts     # 边界吸附到句 / 静音
│   │       │   ├── render.ts            # 媒体步：字幕 / 封面 / 竖版
│   │       │   └── titles.ts            # 标题 + 合规词表过滤 + AI 标识
│   │       ├── skills/highlight-clips.md  # 打分维度、时长约束、去重规则；版本化
│   │       ├── schedules.ts             # 定时拉取回放列表（P1）
│   │       └── evals/highlight-clips.eval.ts
│   │
│   ├── integrations/
│   │   ├── asr/                    # 国内 ASR / FunASR；不知道 LLM
│   │   ├── ffmpeg/                 # 服务端渲染；GPU 可选
│   │   ├── object-storage/         # 预签名、生命周期、租户前缀
│   │   ├── live-recording/         # 直播云录制回调
│   │   └── publish/                # 官方发布接口（有权限则用）
│   │
│   ├── app/
│   │   └── src/
│   │       ├── http/               # POST /v1/tasks · GET /v1/sessions/:id/entries · POST …/input · webhooks/recording · GET /health
│   │       ├── dispatcher.ts       # claimDue → 任务定义 → 开 session → 逐步执行 → 落 entries
│   │       └── main.ts             # `http` 与 `worker` 两个入口
│   │
│   ├── web/                        # 任务看板、审片、成本；不算力
│   └── evals/
│
├── workers/
│   └── media/                      # Python：认领「媒体子任务」行（extract-audio / transcribe / render）；
│                                   # 调 ASR / ffmpeg，结果只落对象存储 + 子任务行状态；不知道 LLM、不知道打分
│
└── docs/runbooks/                  # 卡住任务、ASR 供应商切换、存储清理
```

P0 接口（README 原文四条 + 一条回调）：

```text
POST /v1/tasks                          { type: "highlight-clips", payload: { sourceUrl | objectKey, tenant } }
GET  /v1/sessions/:id/entries?since=
POST /v1/sessions/:id/input             approve / 改标题 / 调边界 / 拒 / 叫停
POST /webhooks/recording                直播云录制完成 → 写任务行
GET  /health
```

HTTP 不 await 管道。录制回调与上传都只写任务行，至多 poke dispatcher。

---

## 层 → 目录

| 层 | 落点 | 不做什么 |
| -- | ---- | -------- |
| 队列 | `queue` | 不知道认领之后要转写 |
| 领域 | `slice` | 不 import `queue`、不碰进程 |
| 步骤 | `slice/steps` | 不直调供应商；不写本地盘 |
| 外部系统 | `integrations/*` | 不出现在 prompt |
| 装配 | `app` | 管道不跑在上传请求里 |
| 体验 | `web` | 不算力、不长视频 CRUD；素材库属于别的系统 |
| 质量 | `slice/evals` | 测时间窗 / 条数 / 违禁词，不测标题文采 |

---

## 硬规则（本项目）

1. 浏览器不算力；`app/http`、`web` 不调模型、不打分。
2. 每步幂等可续：重试从失败步开始；输出落对象存储，不落本地盘。
3. `queue` 不 import `core` / `slice`；接线只在 `dispatcher.ts`。
4. 认领必开 session；进度只追加 entries；web 只拉。
5. ASR / LLM / 渲染全经 integrations 或能力平台；任务上钉模型与 SOP 版本。
6. 人审是 `input`（approve / 改标题 / 调边界 / 拒）；最终渲染在人审后；发布必须人审后。
7. 保留期 job 是产品功能；无 eval 的任务类型不进 `schedules`；第二种任务类型先写 eval。
8. 没有「问问这场讲了什么」的聊天入口。

---

## 完成线

| 阶段 | 必须能对外提供 |
| ---- | -------------- |
| P0 | 上传 / URL 投工 → 转写 → 打分 → 片段清单（时间窗 + 标题）→ entries；eval；对象存储；独立 worker |
| P1 | 渲染（字幕 / 封面）；人审 input；录制回调投工；配额与成本；保留期 job；三条告警 |
| P2 | 第二任务类型（`subtitle-burn` / `title-pack`）；官方发布；多 worker 扇出；ASR 供应商切换 eval |
| P3 | 「按品牌要求重剪」需要自由 loop 时装配 `core`；第二宿主时再谈 `protocol` |

---

## 第一条 eval

fixture 转写 → 输出片段与标注区间 IoU ≥ 0.5 的覆盖 ≥ 80%；无 < 15s 或 > 180s 片段；标题无合规词表命中。

## 换型信号

「运营在对话框里说『再往前 3 秒、换个标题』」→ 编辑助手，助手类，另立聊天入口；「运营自己拖节点定义 ASR → 翻译 → 配音」→ 工作流类产品。守住「web 只读 entries + 投 input」。
