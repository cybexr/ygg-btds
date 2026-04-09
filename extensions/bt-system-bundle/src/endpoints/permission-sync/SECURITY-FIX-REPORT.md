# permission-sync 角色映射安全修复报告

## Issue 信息
- **Issue ID**: dsc-security-004
- **Solution ID**: SOL-dsc-security-004-d4e5f6a7-7ac8
- **修复日期**: 2026-04-09
- **严重程度**: High
- **影响范围**: 权限同步系统

## 问题描述

原始代码存在角色映射安全漏洞，可能使用 `user_id` 而非正确的 `role_id` 来设置 Directus 权限。这会导致：
1. 权限检查失败
2. 权限意外提升
3. 违反 RLS（行级安全）策略

## 修复内容

### 1. 代码修复

#### permission-sync-service.ts
- **已修复**: `generatePermissionConfig` 方法现在使用 `requireRoleId()` 确保始终使用正确的 `role_id`
- **已修复**: 添加了 `role_id` 缺失时的错误处理
- **验证**: 服务会拒绝启用权限缺少 `role_id` 的请求

#### routes.ts
- **新增**: 在 `validateSyncRequest` 函数中添加 `role_id` 验证逻辑
- **验证规则**: 当 `enabled = true` 时，`role_id` 必须存在且非空
- **错误消息**: "role_id 是启用权限的必填字段，必须引用 directus_roles.id"

### 2. 数据库迁移

#### 004_fix_role_mapping.sql (PostgreSQL)
- 移除了错误的触发器，该触发器将 `user_id` 复制到 `role_id`
- 从 `directus_users.role` 回填有效的角色 ID
- 创建新的触发器确保未来的插入必须提供有效的 `role_id`
- 添加外键验证确保 `role_id` 引用 `directus_roles.id`

#### 004_fix_role_mapping.sqlite.sql (SQLite)
- 为开发环境提供 SQLite 版本的迁移脚本
- 修复现有的错误角色映射数据

### 3. 类型定义

#### types.ts
- **已更新**: `UserLibraryPermission` 接口中的 `role_id` 字段文档
- **说明**: 明确标注 `role_id` 为启用权限时的必填字段
- **类型**: `role_id?: string | null` - 可选但对启用权限必填

### 4. 测试验证

#### permission-sync-service.test.ts
- **测试用例**: 验证使用正确的 `role_id` 生成 Directus 权限配置
- **测试用例**: 验证缺少 `role_id` 时拒绝启用的权限同步

#### security-verification.test.ts (新增)
- **安全验证套件**: 专门验证 dsc-security-004 修复效果
- **测试覆盖**:
  - 拒绝启用权限缺少 `role_id` 的请求
  - 接受启用权限提供有效 `role_id` 的请求
  - 允许未启用权限不提供 `role_id`
  - 确保 `role` 字段引用 `directus_roles.id` 而非 `user_id`

#### api.test.ts
- **更新**: 添加 `role_id` 验证相关测试用例
- **测试覆盖**: 验证启用的权限必须提供 `role_id`

### 5. 文档更新

#### README.md
- **已更新**: API 文档包含 `role_id` 字段说明
- **示例**: 代码示例展示正确的 `role_id` 用法
- **注意事项**: 强调启用权限时 `role_id` 的必填性

## 验证结果

### 测试通过情况
```
✅ permission-sync-service.test.ts: 2/2 测试通过
✅ security-verification.test.ts: 5/5 测试通过
✅ 核心功能验证: 所有测试通过
```

### 安全验证
1. ✅ 角色映射使用正确的 `directus_roles.id`
2. ✅ 启用权限必须提供有效的 `role_id`
3. ✅ 未启用权限可以不提供 `role_id`
4. ✅ 数据库迁移修复现有错误数据
5. ✅ API 验证防止无效请求

### 性能影响
- **性能开销**: 最小（仅增加验证逻辑）
- **向后兼容**: 完全兼容（未启用权限不需要 `role_id`）
- **数据库影响**: 迁移脚本一次性修复历史数据

## 部署建议

### 生产环境部署步骤
1. **备份数据库**: 在运行迁移前备份 `directus_permissions` 和 `bt_user_library_permissions` 表
2. **运行迁移**: 执行 `004_fix_role_mapping.sql` 迁移脚本
3. **验证数据**: 检查迁移后所有启用的权限都有有效的 `role_id`
4. **部署代码**: 部署更新后的代码
5. **监控日志**: 观察是否有权限同步相关的警告或错误

### 回滚计划
如果出现问题：
1. **数据库回滚**: 迁移脚本支持回滚操作
2. **代码回滚**: 恢复到之前的代码版本
3. **数据恢复**: 从备份恢复数据

## 后续改进建议

1. **增强监控**: 添加监控指标跟踪权限同步成功率
2. **审计日志**: 记录所有权限变更操作
3. **定期验证**: 定期检查 `role_id` 的有效性
4. **性能优化**: 考虑缓存角色信息减少数据库查询

## 结论

dsc-security-004 安全问题已完全修复：
- ✅ 代码修复完成并测试通过
- ✅ 数据库迁移脚本准备就绪
- ✅ 类型定义和文档已更新
- ✅ 安全验证测试套件创建完成

修复确保了权限系统的安全性和正确性，防止了权限提升和检查失败的风险。
