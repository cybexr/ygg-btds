# 导入审计 Hook (Import Validator Hook)

## 功能概述

导入审计 Hook 自动监听 Directus 数据操作事件，记录导入错误和审计日志到专用表中。

## 监听的事件

- **items.error**: 捕获数据操作错误，记录到 `bt_import_errors` 表
- **items.afterCreate**: 记录数据创建操作，审计到 `bt_action_audit_logs` 表
- **items.afterUpdate**: 记录数据更新操作，审计到 `bt_action_audit_logs` 表
- **items.afterDelete**: 记录数据删除操作，审计到 `bt_action_audit_logs` 表

## 数据表

### bt_import_errors
存储导入过程中的详细错误信息：
- 错误类型分类 (validation, constraint, format, database, permission, system)
- 严重级别 (info, warning, error, critical)
- 行数据快照
- 解决状态跟踪

### bt_action_audit_logs
存储所有重要操作的审计记录：
- 操作类型和分类
- 目标对象信息
- 用户上下文 (IP, User Agent)
- 风险评估
- 审批状态

## 使用方式

Hook 会在 Bundle 加载时自动注册。要启用审计功能：

1. 在导入请求中包含 `import_job_id` 参数
2. 确保请求头中包含 `X-Import-Job-Id`（可选）
3. Hook 会自动记录所有符合条件的操作

## 错误分类

### 按严重级别
- **info**: 信息性提示
- **warning**: 警告，不影响导入继续
- **error**: 错误，当前行导入失败
- **critical**: 严重错误，可能导致整个导入失败

### 按错误类型
- **validation**: 数据验证失败
- **constraint**: 数据库约束违反
- **format**: 数据格式错误
- **database**: 数据库错误
- **permission**: 权限不足
- **system**: 系统级错误

## 风险评估

Hook 自动评估操作的风险级别：
- **low**: 常规数据操作
- **medium**: 批量操作
- **high**: 删除、配置变更、权限变更
- **critical**: 系统配置、危险操作

## 性能监控

Hook 内置性能监控：
- 自动记录操作耗时
- 超过 1 秒的操作会记录警告
- 失败操作会记录耗时和错误

## 日志清理

提供自动清理功能：
- 清理 90 天前的低风险审计日志
- 清理 30 天前已解决的导入错误

## 扩展性

可以扩展以下功能：
1. 添加更多事件监听器
2. 自定义错误分类规则
3. 集成告警系统
4. 添加实时统计
5. 导出审计报告
