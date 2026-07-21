# G1-14W 独立审计 MINOR（W14W-01）整改记录

> 日期：2026-07-21　对应报告：`docs/audits/G1-14W-claude-audit-report.md`（CONDITIONAL PASS）　状态：已修复，待 Claude 复审关闭；实施者不自行关闭。

## W14W-01 — VM 内全链转录不完整（已修复）

- 问题：首轮 `C:\wenshu-out\log.txt` 只转录到环境采集，`supply:check` 与完整 `verify` 仅有 `results.txt` 退出码台账。
- 整改：重写 VM 内引导脚本为逐步独立日志（`C:\wenshu-out2\*.log`：install、env-record、environment-check、supply-check、verify 每步全量 stdout/stderr + `results.txt` 退出码台账），重跑全链。第四轮 7/7 步 exit 0，`verify.log` 完整含 typecheck 与 production build 输出。已提交证据 `environment.win11.json` 未被触碰（重采只发生在 VM 内部副本，宿主已审计文件零改动）。
- 过程留痕（如实披露）：第二、三轮重跑曾因 VM 内仓库残留第一轮证据 + 临时 recheck 文件造成同标签证据并存，被多环境门禁的标签互异守卫 fail-closed 拦下（`machine labels must be unique`）——守卫按设计工作；清理残留后第四轮全绿。
- NOTE 跟进：zip 已删除不可复算 SHA（以 VHDX 构建串 22621.1 ni_release 佐证，审计已接受）；VM 内 Startup 引导与载荷保留作为重采集入口（已文档化）；90 天评估期/1024×768/无 Chromium 维持书面限制。

## 实施者验证

- VM 内 `C:\wenshu-out2\`：`node-version`/`pnpm-version`/`install`/`env-record`/`environment-check`/`supply-check`/`verify` 全部 exit 0，每步独立完整日志。
- 宿主：`pnpm environment:check` 双证据通过、`pnpm verify` 退出 0（185 项 ✔）；git 证实 `environment.win11.json` 自审计提交 `60dc31d` 起零改动。
