# Permission Template Service

业务角色到 Directus 权限的翻译服务，负责定义权限模板并映射到 `directus_permissions` 表。

## 功能特性

### 1. 权限模板定义

预定义两种业务角色权限模板：

- **ds-descriptor（数据描述者）**: 拥有完整的 CRUD 权限
  - `create`: 创建数据
  - `read`: 读取数据
  - `update`: 更新数据
  - `delete`: 删除数据

- **ds-reader（数据读取者）**: 仅拥有只读权限
  - `read`: 读取数据

### 2. 核心功能

- **权限生成**: 根据模板生成 Directus 权限记录
- **权限预览**: 在实际应用前预览权限变更
- **权限同步**: 应用权限模板到指定集合
- **批量同步**: 一次性同步多个集合的权限
- **回滚机制**: 支持回滚到指定的同步点
- **权限验证**: 验证权限配置的正确性
- **冲突检测**: 检测权限配置中的冲突和重复

## 使用示例

### 初始化服务

```typescript
import { PermissionTemplateService, BusinessRole } from './services';
import { Knex } from 'knex';

const database: Knex = getDatabase();
const service = new PermissionTemplateService(database);
```

### 获取权限模板

```typescript
const template = service.getTemplate(BusinessRole.DESCRIPTOR);
console.log(template);
// {
//   role: 'ds-descriptor',
//   description: '数据描述者：拥有完整的 CRUD 权限',
//   permissions: ['create', 'read', 'update', 'delete'],
//   field_access: 'full'
// }
```

### 生成权限记录

```typescript
const permissions = service.generatePermissionsFromTemplate(
	'bt_my_dataset',    // 集合名称
	BusinessRole.DESCRIPTOR,  // 业务角色
	'role-123'          // Directus 角色 ID
);
```

### 预览权限变更

```typescript
const preview = await service.previewPermissions(
	'bt_my_dataset',
	BusinessRole.READER,
	'role-123'
);

console.log('摘要:', preview.summary);
// {
//   to_create: 1,    // 需要创建的权限数量
//   to_update: 0,    // 需要更新的权限数量
//   to_delete: 3,    // 需要删除的权限数量
//   unchanged: 0     // 无变化的权限数量
// }
```

### 同步权限

```typescript
const result = await service.syncPermissions(
	'bt_my_dataset',
	BusinessRole.DESCRIPTOR,
	'role-123',
	123  // 执行同步的用户 ID
);

console.log('同步结果:', result);
// {
//   success: true,
//   collection: 'bt_my_dataset',
//   role: 'ds-descriptor',
//   permissions_created: 4,
//   permissions_updated: 0,
//   permissions_deleted: 0,
//   errors: [],
//   sync_log_id: 1
// }
```

### 批量同步

```typescript
const collections = ['bt_dataset_1', 'bt_dataset_2', 'bt_dataset_3'];

const results = await service.batchSyncPermissions(
	collections,
	BusinessRole.READER,
	'role-123',
	123  // 用户 ID
);

results.forEach((result, index) => {
	console.log(`${collections[index]}: ${result.success ? '成功' : '失败'}`);
});
```

### 回滚权限

```typescript
// 获取可用的回滚点
const rollbackPoints = await service.getRollbackPoints('bt_my_dataset', 'role-123');

console.log('可回滚点:', rollbackPoints);
// [
//   {
//     sync_log_id: 5,
//     timestamp: 2024-01-15T10:30:00.000Z,
//     permissions_snapshot: [...],
//     collection: 'bt_my_dataset',
//     role_id: 'role-123'
//   },
//   ...
// ]

// 回滚到指定同步点
const success = await service.rollbackToSyncPoint(
	5,    // sync_log_id
	123   // 用户 ID
);

console.log('回滚' + (success ? '成功' : '失败'));
```

### 权限验证

```typescript
const permissions = service.generatePermissionsFromTemplate(
	'bt_my_dataset',
	BusinessRole.DESCRIPTOR,
	'role-123'
);

const validation = service.validatePermissions(permissions);

if (!validation.valid) {
	console.error('权限配置错误:', validation.errors);
} else {
	console.log('权限配置有效');
}
```

### 冲突检测

```typescript
const conflicts = await service.detectConflicts('bt_my_dataset', 'role-123');

if (conflicts.length > 0) {
	console.warn('发现权限冲突:', conflicts);
} else {
	console.log('无权限冲突');
}
```

## 数据库表结构

### bt_permission_sync_logs

记录所有权限同步操作的日志表：

```sql
CREATE TABLE bt_permission_sync_logs (
    id SERIAL PRIMARY KEY,
    operation_type VARCHAR(50) NOT NULL,
    collection_name VARCHAR(255) NOT NULL,
    dataset_registry_id INTEGER REFERENCES bt_dataset_registry(id),
    permission_type VARCHAR(50),
    role_id INTEGER REFERENCES directus_roles(id),
    user_id INTEGER REFERENCES directus_users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    permissions_before JSONB,
    permissions_after JSONB,
    changes_made JSONB,
    error_message TEXT,
    performed_by_user_id INTEGER REFERENCES directus_users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

## API 参考

### PermissionTemplateService

#### 方法

- `getTemplate(role: BusinessRole): PermissionTemplate`
  - 获取指定角色的权限模板

- `getAllTemplates(): PermissionTemplate[]`
  - 获取所有可用的权限模板

- `generatePermissionsFromTemplate(collection, role, directusRoleId): DirectusPermission[]`
  - 根据模板生成 Directus 权限记录

- `previewPermissions(collection, role, directusRoleId): Promise<PermissionPreviewDetail>`
  - 预览权限变更（不实际执行）

- `syncPermissions(collection, role, directusRoleId, userId, dryRun): Promise<PermissionSyncResult>`
  - 同步权限到 Directus

- `batchSyncPermissions(collections, role, directusRoleId, userId): Promise<PermissionSyncResult[]>`
  - 批量同步多个集合的权限

- `rollbackToSyncPoint(syncLogId, userId): Promise<boolean>`
  - 回滚权限到指定的同步点

- `getRollbackPoints(collection, roleId, limit): Promise<RollbackPoint[]>`
  - 获取可用的回滚点列表

- `validatePermissions(permissions): { valid: boolean; errors: string[] }`
  - 验证权限配置

- `detectConflicts(collection, directusRoleId): Promise<string[]>`
  - 检测权限冲突

## 注意事项

1. **集合级权限**: 当前实现仅支持集合级权限控制，不支持字段级权限（MVP 约束）
2. **事务安全**: 所有权限同步操作都在事务中执行，确保数据一致性
3. **日志记录**: 所有权限同步操作都会记录到 `bt_permission_sync_logs` 表
4. **回滚限制**: 只能回滚到之前成功完成的同步点
5. **角色映射**: 业务角色需要映射到具体的 Directus 角色 ID
6. **Admin 权限**: `directusRoleId` 为 `null` 表示 admin 角色

## 类型定义

### BusinessRole

```typescript
enum BusinessRole {
    DESCRIPTOR = 'ds-descriptor',
    READER = 'ds-reader',
}
```

### PermissionTemplate

```typescript
interface PermissionTemplate {
    role: BusinessRole;
    description: string;
    permissions: PermissionAction[];
    field_access: 'full' | 'custom';
    custom_fields?: string[];
}
```

### PermissionSyncResult

```typescript
interface PermissionSyncResult {
    success: boolean;
    collection: string;
    role: BusinessRole;
    permissions_created: number;
    permissions_updated: number;
    permissions_deleted: number;
    errors: string[];
    sync_log_id?: number;
}
```

## 测试

运行测试：

```bash
npm test -- permission-template.test.ts
```

测试覆盖：
- 权限模板定义和获取
- 权限记录生成
- 权限配置验证
- 冲突检测
- 权限同步功能
- 回滚机制
