# PB-04 · Claude 独立审计任务

## 审计目标

独立验证模型唯一写路径、prompt-injection 与权限拒绝、六项工具契约和 PB-03 原子性。
审计者只能写本审计报告，不能修改 PB-04/PB-03/PB-02 实现、G1-04 契约、lockfile、SBOM
或验收口径。

## 必验收点

1. 从模型可获得的公共 `@wenshu/semantic-tools` 表面出发，确认仅有六个固定工具；不能
   得到 raw 操作、编译函数、`TransactionManager`、`@wenshu/semantic-editor/internal`、
   DOM 或存储。构造绕过尝试，确认模型不能直接写 document。
2. 对六个工具各自独立调用，核其结果均来自真实 PB-03 `ai` 事务，并检查产物仍满足
   G1-04 schema 与稳定 ID 规则。核 `affectedNodeIds` 由事务透传而非另行猜测。
3. 向 envelope/args 注入额外 command、path、operation、tool 字段，使用未知工具、
   原型对象和 accessor；逐条确认严格拒绝且无写入。验证含注入样式的普通文本只会作为
   文本数据，绝不改变工具权限或操作种类。
4. 构造无权限、工具未授权、目标不存在、目标非容器、rewrite 非文本块及循环 move；确认
   均 fail-closed。循环 move 必须经过真实事务并逐字段回滚，不能只靠预检查掩盖。
5. 审计工具集恰为六项且无动态注册；核无 UI/diff/存储/模型/CRDT 夹带，供应链仅为
   workspace 连接、SBOM 可重建，冻结物零漂移。
