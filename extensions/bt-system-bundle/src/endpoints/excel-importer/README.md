# Excel 导入 API 端点

## 概述

提供 Excel 文件导入功能的 RESTful API 端点，支持文件上传、自动类型推断、动态集合创建和数据导入。

## API 端点

### 1. 上传 Excel 文件

**端点**: `POST /custom/excel/upload`

**请求**:
- Content-Type: `multipart/form-data`
- Body: `file` (文件)

**文件限制**:
- 支持格式: `.xlsx`, `.xls`
- 最大文件大小: 10MB
- 允许的 MIME 类型:
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `application/vnd.ms-excel`

**响应示例**:
```json
{
  "success": true,
  "task_id": "excel_1712561234567_abc123def",
  "message": "文件上传成功"
}
```

**错误响应**:
```json
{
  "error": "FILE_TOO_LARGE",
  "message": "文件大小不能超过 10MB"
}
```

---

### 2. 解析 Excel 文件

**端点**: `POST /custom/excel/parse`

**请求**:
```json
{
  "task_id": "excel_1712561234567_abc123def"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "file_name": "data.xlsx",
    "sheet_count": 1,
    "sheets": [
      {
        "sheet_name": "Sheet1",
        "row_count": 100,
        "column_count": 5,
        "headers": ["姓名", "年龄", "邮箱", "手机号", "注册日期"],
        "fields": [
          {
            "field_name": "name",
            "display_name": "姓名",
            "type": "string",
            "nullable": false,
            "primary_key": false,
            "unique": false,
            "max_length": 100
          },
          {
            "field_name": "age",
            "display_name": "年龄",
            "type": "integer",
            "nullable": false,
            "primary_key": false,
            "unique": false
          }
        ],
        "preview_data": [
          { "姓名": "张三", "年龄": 25, "邮箱": "zhangsan@example.com" }
        ]
      }
    ]
  }
}
```

---

### 3. 创建集合

**端点**: `POST /custom/excel/create-collection`

**请求**:
```json
{
  "task_id": "excel_1712561234567_abc123def",
  "collection_name": "user_data",
  "field_mappings": [
    {
      "field_name": "name",
      "display_name": "姓名",
      "type": "string",
      "nullable": false,
      "primary_key": true,
      "unique": true,
      "max_length": 100
    },
    {
      "field_name": "age",
      "display_name": "年龄",
      "type": "integer",
      "nullable": true,
      "primary_key": false,
      "unique": false
    }
  ]
}
```

**集合名称规则**:
- 必须以小写字母开头
- 只能包含小写字母、数字和下划线
- 不能使用 SQL 保留字

**响应示例**:
```json
{
  "success": true,
  "data": {
    "collection_name": "user_data",
    "fields_created": 5,
    "data_imported": 100
  },
  "message": "集合创建成功"
}
```

---

### 4. 查询任务状态

**端点**: `GET /custom/excel/task/:id`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "excel_1712561234567_abc123def",
    "status": "completed",
    "created_at": "2024-04-08T10:30:00.000Z",
    "updated_at": "2024-04-08T10:35:00.000Z",
    "file_name": "data.xlsx",
    "file_size": 24567,
    "collection_name": "user_data",
    "progress": 100
  }
}
```

**任务状态值**:
- `pending`: 等待处理
- `processing`: 处理中
- `completed`: 已完成
- `failed`: 失败

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| `FILE_MISSING` | 未上传文件 |
| `INVALID_FILE_TYPE` | 不支持的文件类型 |
| `FILE_TOO_LARGE` | 文件大小超过限制 |
| `MISSING_TASK_ID` | 缺少任务 ID |
| `TASK_NOT_FOUND` | 任务不存在 |
| `MISSING_PARAMETERS` | 缺少必要参数 |
| `INVALID_COLLECTION_NAME` | 集合名称格式错误 |
| `PARSE_FAILED` | 文件解析失败 |
| `CREATE_COLLECTION_FAILED` | 集合创建失败 |
| `GET_TASK_STATUS_FAILED` | 获取任务状态失败 |

## 使用示例

### cURL 示例

```bash
# 1. 上传文件
curl -X POST http://localhost:8055/custom/excel/upload \
  -F "file=@/path/to/data.xlsx"

# 2. 解析文件
curl -X POST http://localhost:8055/custom/excel/parse \
  -H "Content-Type: application/json" \
  -d '{"task_id": "excel_1712561234567_abc123def"}'

# 3. 创建集合
curl -X POST http://localhost:8055/custom/excel/create-collection \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "excel_1712561234567_abc123def",
    "collection_name": "user_data",
    "field_mappings": [...]
  }'

# 4. 查询任务状态
curl http://localhost:8055/custom/excel/task/excel_1712561234567_abc123def
```

### JavaScript 示例

```javascript
// 上传文件
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const uploadResponse = await fetch('/custom/excel/upload', {
  method: 'POST',
  body: formData,
});

const { task_id } = await uploadResponse.json();

// 解析文件
const parseResponse = await fetch('/custom/excel/parse', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ task_id }),
});

const { data: parseResult } = await parseResponse.json();

// 创建集合
const createResponse = await fetch('/custom/excel/create-collection', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task_id,
    collection_name: 'user_data',
    field_mappings: parseResult.sheets[0].fields,
  }),
});
```

## 安全注意事项

1. **文件验证**: 所有上传的文件都会进行 MIME 类型和大小验证
2. **集合名称**: 集合名称严格验证，防止 SQL 注入
3. **错误处理**: 所有错误都有详细的错误码和消息
4. **任务隔离**: 每个上传任务都有唯一的 ID，避免冲突
5. **权限控制**:
   - 使用统一的权限检查器服务进行权限验证
   - 基于角色的访问控制（RBAC）
   - 支持的操作权限：
     - `upload_file`: 上传文件（需要数据集编辑者或更高级别）
     - `parse_file`: 解析文件（需要数据集编辑者或更高级别）
     - `create_collection`: 创建集合（需要数据集管理员或更高级别）
     - `truncate_dataset`: 清空数据集（需要数据集管理员或更高级别）
     - `delete_collection`: 删除数据集（需要数据集管理员或更高级别）
   - 角色层级：
     - `admin`: 系统管理员 - 所有权限
     - `ds-manager`: 数据集管理员 - 管理数据集的完整生命周期
     - `ds-editor`: 数据集编辑者 - 上传和导入数据
     - `dataset-viewer`: 数据集查看者 - 只读访问
     - `public`: 公共访问 - 无权限

## 权限配置示例

### Directus 角色配置

在 Directus 中配置自定义角色以支持权限系统：

```sql
-- 创建数据集管理员角色
INSERT INTO directus_roles (name, icon, description)
VALUES ('数据集管理员', 'admin', '具有数据集的完全管理权限');

-- 创建数据集编辑者角色
INSERT INTO directus_roles (name, icon, description)
VALUES ('数据集编辑者', 'edit', '可以上传和导入数据');

-- 创建数据集查看者角色
INSERT INTO directus_roles (name, icon, description)
VALUES ('数据集查看者', 'visibility', '只能查看数据集内容');
```

### 权限检查使用示例

```typescript
import { PermissionChecker, PermissionAction } from '@/shared/services/permission-checker';

// 在路由处理中使用权限检查
router.post('/custom/excel/upload', async (req, res) => {
  const userContext = PermissionChecker.extractUserContext(req);
  const result = PermissionChecker.hasPermission(
    userContext,
    PermissionAction.UPLOAD_FILE
  );

  if (!result.granted) {
    return res.status(403).json({
      error: result.errorCode,
      message: result.errorMessage,
    });
  }

  // 继续处理上传逻辑...
});
```

## 后续实现

当前版本提供了 API 骨架，以下功能将在后续任务中实现：

1. **Excel 解析引擎**: 使用 `xlsx` 库解析 Excel 文件
2. **类型推断**: 基于数据内容自动推断字段类型
3. **Schema API 集成**: 调用 Directus Schema API 创建集合
4. **数据导入**: 批量导入 Excel 数据到集合
5. **进度跟踪**: 实时更新任务进度
6. **错误恢复**: 处理部分失败的数据导入
