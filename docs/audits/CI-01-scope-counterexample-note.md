# CI-01 反例 1/5/6 证据载体（探针文件，不合并）

本文件与一次对 `docs/implementation-roadmap.md` 的纯空白触碰共同构成 CI-01
配置棒的 docs-only 反例提交：预期 scope 判定 `docs_only=true`，仅
static/unit-config/security 三 job 真实执行，其余六 job 全部 step skipped。
证据采集完毕后本 PR（base=ci-01-config）关闭不合并，本文件不进 main。
