# 权限同步 API

将业务层的用户-库权限矩阵转换为 Directus 原生权限配置。

## 功能

- **权限同步**: 将用户-库权限矩阵同步到 `directus_permissions` 表
- **权限预览**: 预览权限变更，不实际写入数据库
- **权限模板**: 支持预定义的权限模板（ds-descriptor CRUD, ds-reader Read）
- **事务处理**: 使用数据库事务确保数据一致性
- **权限验证**: 完整的请求验证和错误处理

## API 接口

### 1. 同步权限

**接口**: `POST /custom/permissions/sync`

**请求体**:
```json
{
  "user_library_permissions": [
    {
      "user_id": "user-uuid",
      "library_id": "library-uuid",
      "template": "ds-descriptor-crud",
      "enabled": true,
      "custom_permissions": {
        "actions": ["create", "read", "update", "delete"],
        "fields": null,
        "permissions": null,
        "validation": null,
        "presets": null
      }
    }
  ],
  "preview": false,
  "overwrite": true,
  "collections": null
}
```

**响应**:
```json
{
  "success": true,
  "message": "权限同步成功",
  "data": {
    "created_ids": [1, 2, 3],
    "updated_ids": [4, 5],
    "deleted_ids": [6],
    "stats": {
      "users_count": 10,
      "libraries_count": 5,
      "create_count": 3,
      "update_count": 2,
      "delete_count": 1,
      "conflict_count": 0
    }
  }
}
```

### 2. 预览权限变更

**接口**: `GET /custom/permissions/preview` 或 `POST /custom/permissions/preview`

**GET 请求参数**:
- `data`: JSON 字符串格式的请求数据

**POST 请求体**: 与同步接口相同，但自动设置 `preview: true`

**响应**:
```json
{
  "success": true,
  "data": {
    "permissions_to_create": [...],
    "permissions_to_update": [...],
    "permissions_to_delete": [6, 7],
    "conflicts": [],
    "stats": {
      "users_count": 10,
      "libraries_count": 5,
      "create_count": 3,
      "update_count": 2,
      "delete_count": 2,
      "conflict_count": 0
    }
  }
}
```

## 权限模板

### ds-descriptor-crud
**描述**: 数据描述符完整 CRUD 权限
**权限**: create, read, update, delete
**适用集合**: ds-descriptors, ds-descriptor-revisions, ds-descriptor-tags, ds-descriptor-relationships

### ds-reader-read
**描述**: 数据只读权限
**权限**: read
**限制**: 只能查看已发布的数据（status = 'published'）
**适用集合**: ds-descriptors, ds-descriptor-revisions, ds-descriptor-tags, ds-descriptor-relationships

## 数据类型

### UserLibraryPermission
```typescript
interface UserLibraryPermission {
  user_id: string;           // 用户 ID
  library_id: string;        // 库 ID
  template: PermissionTemplate;  // 权限模板
  enabled: boolean;          // 是否启用
  custom_permissions?: Partial<PermissionConfig>;  // 自定义权限配置
}
```

### PermissionConfig
```typescript
interface PermissionConfig {
  actions: PermissionAction[];      // 权限动作列表
  fields: string[] | null;          // 允许访问的字段
  permissions?: Record<string, any> | null;   // 权限过滤规则
  validation?: Record<string, any> | null;    // 验证规则
  presets?: Record<string, any> | null;       // 预设值
}
```

### DirectusPermission
```typescript
interface DirectusPermission {
  id?: number;
  role: string | null;              // 角色 ID
  collection: string;               // 集合名称
  action: PermissionAction;         // 权限动作
  permissions: Record<string, any> | null;
  validation: Record<string, any> | null;
  presets: Record<string, any> | null;
  fields: string[] | null;
  system?: true;
}
```

## 错误处理

所有 API 接口都返回统一的错误格式：

```json
{
  "error": "ERROR_CODE",
  "message": "错误描述",
  "details": "详细错误信息",
  "errors": [
    {
      "field": "field_name",
      "message": "字段错误描述",
      "code": "ERROR_CODE"
    }
  ]
}
```

### 常见错误码

- `VALIDATION_ERROR`: 请求数据验证失败
- `DATABASE_NOT_AVAILABLE`: 数据库连接不可用
- `SYNC_FAILED`: 权限同步失败
- `PREVIEW_FAILED`: 权限预览失败

## 使用示例

### JavaScript/TypeScript

```typescript
import axios from 'axios';

// 同步权限
const syncPermissions = async () => {
  try {
    const response = await axios.post('/custom/permissions/sync', {
      user_library_permissions: [
        {
          user_id: 'user-123',
          library_id: 'library-456',
          template: 'ds-descriptor-crud',
          enabled: true,
        },
      ],
      overwrite: true,
    });

    console.log('权限同步成功:', response.data);
  } catch (error) {
    console.error('权限同步失败:', error.response.data);
  }
};

// 预览权限变更
const previewPermissions = async () => {
  try {
    const response = await axios.post('/custom/permissions/preview', {
      user_library_permissions: [
        {
          user_id: 'user-123',
          library_id: 'library-456',
          template: 'ds-reader-read',
          enabled: true,
        },
      ],
    });

    console.log('权限预览:', response.data);
  } catch (error) {
    console.error('权限预览失败:', error.response.data);
  }
};
```

### cURL

```bash
# 同步权限
curl -X POST http://localhost:8080/custom/permissions/sync \
  -H "Content-Type: application/json" \
  -d '{
    "user_library_permissions": [
      {
        "user_id": "user-123",
        "library_id": "library-456",
        "template": "ds-descriptor-crud",
        "enabled": true
      }
    ],
    "overwrite": true
  }'

# 预览权限变更
curl -X POST http://localhost:8080/custom/permissions/preview \
  -H "Content-Type: application/json" \
  -d '{
    "user_library_permissions": [
      {
        "user_id": "user-123",
        "library_id": "library-456",
        "template": "ds-reader-read",
        "enabled": true
      }
    ]
  }'
```

## 注意事项

1. **事务处理**: 权限同步使用数据库事务，确保操作的原子性
2. **权限覆盖**: 设置 `overwrite: true` 会覆盖现有权限
3. **集合过滤**: 可以通过 `collections` 参数指定要同步的集合
4. **权限验证**: API 会验证请求格式和必填字段
5. **错误处理**: 所有操作都有完整的错误处理和日志记录

## 文件结构

```
permission-sync/
├── index.ts                    # Endpoint 注册
├── routes.ts                   # API 路由定义
├── types.ts                    # TypeScript 类型定义
├── templates.ts                # 权限模板定义
├── permission-sync-service.ts  # 权限同步服务
├── express.d.ts                # Express 扩展类型
├── __tests__/
│   └── api.test.ts            # API 测试
└── README.md                   # 本文档
```
