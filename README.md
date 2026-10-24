# pi-duet

> 基于 [pi](https://github.com/earendil-works/pi)，实现一个个人的 Claude Duet。

## 项目介绍

pi-duet 是一个**个人版 Claude Duet**：本机常驻的主动式助理。它像 Claude Duet 一样在后台持续观察已连接的数据源（邮箱、日历），主动整理事项、按时给出每日简报、必要时即时提醒，而发送邮件等对外动作必须先经用户批准。关掉终端它仍在运行，进程被强杀后自动恢复调度，机器重启后照常工作。

Claude Duet 没有公开源码，本项目只复刻其公开的产品行为，不含、也未使用其任何代码。运行时底座完全来自 MIT 许可的 pi agent runtime（durable 持久化与崩溃恢复、多 Provider 模型层、agent loop），个人层代码集中在 `packages/personal-agent`，不修改任何上游包。

## 项目目标

在 pi 的 durable 运行时（持久化对话/任务/文档、崩溃恢复、多 Provider 模型层）之上，补齐一层「个人助理」，形成可日常使用的单用户闭环：

- **常驻运行**：守护进程 + 本地 Web 控制台，进程被强杀后自动恢复调度，定时任务不丢不重。
- **数据接入**：邮箱（IMAP 拉取 / SMTP 发送，应用专用密码，无需 OAuth）与日历（ICS 只读订阅），增量拉取、单源失败隔离。
- **主动简报**：LLM 结构化抽取 + 确定性打分，跨源去重；无新内容时零模型调用；安静时段、冷却与每日打扰上限。
- **审批执行**：只有「发送邮件」一类外部动作，持久化审批队列 + 原子认领，做到至多一次发送；重复批准、重启都不重发。
- **安全边界**：控制台仅监听回环地址、令牌鉴权；邮件正文等内容一律视为不可信输入；支付/转账等高风险请求结构性拒绝。

边界：第一期只服务一个用户、一台机器；不做云端托管、公网访问、多租户；机器关机期间不运行。

## 与上游 pi 的关系

本仓库是 `earendil-works/pi`（commit `136b87e`，MIT 许可）的完整拷贝，`upstream` remote 保留用于合并上游。**不修改任何上游包**；个人层代码只放在 `packages/personal-agent`（及 M5 的 `apps/personal-web`）。上游版权与署名见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

```text
呈现层   apps/personal-web        React 控制台（M5）
个人层   packages/personal-agent   durable docs / 调度器 / 连接器 / 审批 / CLI / 本地控制台
上游层   packages/{durable,ai,agent,...}   pi 运行时（不修改，锁 1.4.0）
```

## 当前进度：1 / 6

模块清单与验收以 [`预实现清单.md`](预实现清单.md) 为唯一进度源；每个模块完成要求可复现的量化证据（见 `docs/personal-agent/modules/*/checklist.md` 与 `docs/personal-agent/resume.md`）。

| 模块 | 内容 | 状态 |
|---|---|---|
| M1 常驻运行时与本地控制台 | durable docs、crash-safe 调度任务、`pi-personal` CLI、令牌鉴权控制台 | **完成（2026-10-24）** |
| M2 邮箱与日历接入 | IMAP/SMTP + ICS、UIDVALIDITY 游标、keyring 凭证 | 未开始 |
| M3 主动抽取与简报 | LLM 抽取、打分、简报、打扰抑制、预算 | 未开始 |
| M4 审批与安全执行 | 审批状态机、at-most-once 发送、注入/高风险防护 | 未开始 |
| M5 对话与控制台 | personal 扩展与工具、讨论串、SSE、React 控制台、记忆 | 未开始 |
| M6 工程化与验收 | 全量测试、自启动、真实账号联调、指标定稿 | 未开始 |

M1 实测证据（Windows，Node 26.5.0）：冷启动 1078 ms；SIGKILL 重启后下一 tick 1068 ms（< 2 个间隔）；重复 tick id = 0；空闲 60 秒 CPU 0%；未授权请求 401 / 授权 200；5 个测试文件 20 个用例全绿。

## 快速开始（源码运行）

```bash
npm install --ignore-scripts --no-audit --no-fund

cd packages/personal-agent
RUN="node --conditions=source --import ./scripts/source-resolve.mjs"
$RUN src/cli.ts init --data-dir .demo     # 打印一次性令牌与控制台地址
$RUN src/cli.ts serve --data-dir .demo    # 127.0.0.1:8765，令牌鉴权
$RUN src/cli.ts status --data-dir .demo   # 只读状态

# 强杀重启证据（自动断言 tick 不丢不重）
$RUN scripts/m1-restart.mjs
```

`scripts/source-resolve.mjs` 是包内的运行时源码重定向器：`pi-ai` 与 `pi-telemetry` 的部分入口未发布 `source` 导出条件，源码直跑时由它指向源文件，不修改上游。

## 文档

- [`docs/personal-agent/spec.md`](docs/personal-agent/spec.md) — 产品需求（F1–F17 / AC1–AC20）
- [`docs/personal-agent/roadmap.md`](docs/personal-agent/roadmap.md) — 模块路线与验收契约
- [`docs/personal-agent/resume.md`](docs/personal-agent/resume.md) — 声明与实测指标台账
- [`docs/personal-agent/adr/0001-fork-pi.md`](docs/personal-agent/adr/0001-fork-pi.md) — fork 决策
- [`docs/personal-agent/modules/01-runtime/`](docs/personal-agent/modules/01-runtime/) — M1 规格、计划与验收记录

## License

MIT（含上游 pi 代码，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)）。
