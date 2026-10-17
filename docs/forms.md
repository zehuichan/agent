# 形态 → 位置

形态是什么、典型产品有哪些，见 `../README.md`「产品形态」。本篇只答一件事：每种形态在 [architecture.md](architecture.md) 的分层里要填哪些位置。形态不参与判型；同一个产品开多个入口，就把多行的「入口」列合起来。

| #   | 形态                  | 编排                                     | 触发             | 入口                                               | 额外能力                                  | bundle            |
| --- | --------------------- | ---------------------------------------- | ---------------- | -------------------------------------------------- | ----------------------------------------- | ----------------- |
| 1   | 嵌入挂件 / SDK        | 自由循环                                 | 人在场           | `channel/channel-widget` 或 `sdk/*`                | —                                         | `assistant-app`   |
| 2   | CLI / TUI             | 自由循环                                 | 人在场           | 产品仓 `apps/cli`                                  | `fs/*` `shell/*` `sandbox/*`              | `coding-app`      |
| 3   | Web 对话              | 自由循环 + `subagent/*`                  | 人在场           | `channel/channel-web-chat` + `client/`             | `web/*` `attachment/*` `sandbox/*`        | `assistant-app`   |
| 4   | 字段 / 组件级内嵌     | 单步 preset（`maxSteps=1` + 输出 schema） | 人在场           | 产品仓 `apps/http` 一个端点                        | `integrations/<vendor>`                   | `assistant-app`   |
| 5   | 应用内侧边栏 Copilot  | 自由循环                                 | 人在场           | `channel/channel-widget`                           | 宿主页面上下文经 `context/*` 注入         | `assistant-app`   |
| 6   | IDE 插件              | 自由循环                                 | 人在场           | `acp/*` 或 `sdk/*`                                 | `fs/*` `shell/*` `lsp/*`                  | `coding-app`      |
| 7   | 桌面 / Computer Use   | 自由循环                                 | 人在场           | 桌面壳 + `sdk/*`                                   | `computer-use/*` `fs/*`                   | `coding-app`      |
| 8   | 浏览器 Agent / 扩展   | 自由循环                                 | 人在场           | 浏览器扩展 + `sdk/*`                               | `browser-use/*`                           | `assistant-app`   |
| 9   | IM / 协作平台 Bot     | 自由循环                                 | 人在场（@ 调用） | `channel/channel-wecom` / `channel/channel-feishu` | 多人身份透传                              | `assistant-app`   |
| 10  | 后台异步 / 云端 Agent | 自由循环                                 | 队列认领         | 产品仓 `apps/http` 投工 + 只读 `client/`           | `sandbox/*` `fs/*` `shell/*` `deliverables/*` | `worker-app`  |
| 11  | 低代码编排平台        | 图执行器                                 | 图触发器         | `client/` 画布 + `api/*`                           | —                                         | `graph-app`       |
| 12  | 无界面 API / SDK / 协议 | 任意                                   | 任意             | `sdk/*` `acp/*` `mcp/mcp-server`                   | —                                         | `sdk-app`         |
| 13  | 数字员工 / Agentic RPA | 图执行器或自由循环                      | 队列 + 定时      | 只读 `client/` + IM 通知                           | `computer-use/*` 或 `browser-use/*`、`integrations/<vendor>` | `worker-app` + `graph-app` |
| 14  | 语音 / 实时           | 自由循环（可打断）                       | 人在场           | `channel/channel-voice`                            | `attachment/*`                            | `assistant-app`   |
| 15  | 移动端 / OS / 硬件    | 自由循环                                 | 人在场           | `sdk/*`                                            | 端侧执行的工具，见下文                    | `assistant-app`   |

## 对内核的额外要求

两种形态要求内核在建时就具备的能力，不能等到形态出现再补：

- **语音 / 实时（14）要能打断。** 进行中的 turn 必须能取消，取消原因写进 `turn/end`；已发出的工具调用要补齐结果事件。dsh 的 `core/agent-loop` 支持请求级取消，可对照。
- **移动端 / OS / 硬件（15）要端云协同。** 部分工具在设备上执行，由云端内核经协议回调，要求 `sdk/protocol` 支持「客户端执行的工具」：调用和结果都写进会话日志，超时与断连有显式失败结果。dsh 里没有可直接对照的机制，按本仓设计。

## 入口多不改类型

加一个入口是在层 4 加一个渠道适配器，或接一个 `sdk/*` 客户端；不在 `core/*` 里分叉，不改判型。
