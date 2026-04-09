# Collection Validator

增强的集合名称验证工具，用于保护 permission-sync 端点免受路径穿越、SQL 注入、XSS 和其他安全攻击。

## 功能特性

### 安全防护

- **路径穿越防护**: 阻止 `../`、`..\\`、URL 编码变体等路径穿越攻击
- **SQL 注入防护**: 检测和阻止常见的 SQL 注入模式
- **XSS 防护**: 识别跨站脚本攻击向量
- **Null 字节注入**: 防止 null 字节绕过验证
- **危险字符检测**: 过滤 shell 元字符和特殊字符
- **系统集合保护**: 阻止访问 Directus 系统集合（`directus_*`）

### 验证规则

- 集合名称必须以字母开头
- 只能包含字母、数字、下划线和连字符
- 最大长度 64 字符
- 支持白名单验证
- 可选的系统集合访问控制

## 使用方法

### 基础验证

```typescript
import { validateCollection } from './utils/collection-validator';

const result = validateCollection('my_data');

if (result.isValid) {
  console.log(`有效集合: ${result.normalized}`);
  console.log(`安全编码: ${result.sanitized}`);
} else {
  console.error(`验证失败: ${result.error}`);
  console.error(`错误代码: ${result.errorCode}`);
}
```

### 带白名单验证

```typescript
const allowedCollections = new Set(['users', 'posts', 'comments']);

const result = validateCollection('users', {
  allowedCollections
});
```

### 允许系统集合访问

```typescript
const result = validateCollection('directus_users', {
  allowSystemCollections: true
});
```

### 批量验证

```typescript
import { validateCollections } from './utils/collection-validator';

const collections = ['users', 'posts', '../admin', 'comments'];
const results = validateCollections(collections);

results.forEach((result, index) => {
  console.log(`${collections[index]}: ${result.isValid ? '有效' : '无效'}`);
});
```

### 过滤有效集合

```typescript
import { filterValidCollections } from './utils/collection-validator';

const collections = ['users', '../admin', 'posts', '<script>'];
const validCollections = filterValidCollections(collections);

console.log(validCollections); // ['users', 'posts']
```

### 便捷方法

```typescript
import { isCollectionAccessible, validateCollectionOrThrow } from './utils/collection-validator';

// 快速检查
if (isCollectionAccessible('users')) {
  // 允许访问
}

// 验证或抛出错误
try {
  const name = validateCollectionOrThrow('users');
  console.log(`有效集合: ${name}`);
} catch (error) {
  console.error(`验证失败: ${error.message}`);
  console.error(`错误代码: ${(error as any).errorCode}`);
}
```

### 创建预配置验证器

```typescript
import { createCollectionValidator } from './utils/collection-validator';

const validator = createCollectionValidator({
  allowedCollections: new Set(['users', 'posts']),
  allowSystemCollections: false,
  maxLength: 64
});

const result = validator('users');
```

## 错误代码

| 错误代码 | 描述 |
|---------|------|
| `EMPTY_COLLECTION_NAME` | 集合名称为空 |
| `COLLECTION_NAME_TOO_LONG` | 超过最大长度限制 |
| `NULL_BYTE_DETECTED` | 检测到 null 字节注入 |
| `PATH_TRAVERSAL_DETECTED` | 检测到路径穿越攻击 |
| `SQL_INJECTION_DETECTED` | 检测到 SQL 注入尝试 |
| `XSS_DETECTED` | 检测到 XSS 攻击尝试 |
| `DANGEROUS_CHAR_DETECTED` | 检测到危险字符 |
| `SYSTEM_COLLECTION_BLOCKED` | 尝试访问系统集合 |
| `INVALID_COLLECTION_FORMAT` | 集合名称格式无效 |
| `COLLECTION_NOT_IN_WHITELIST` | 集合不在白名单中 |

## 集成到 Permission Sync Service

```typescript
import { validateCollectionOrThrow } from './utils/collection-validator';

export class PermissionSyncService {
  async syncPermissions(request: PermissionSyncRequest) {
    // 验证所有集合名称
    for (const collection of request.collections) {
      try {
        validateCollectionOrThrow(collection, {
          allowSystemCollections: false
        });
      } catch (error) {
        throw new Error(`无效的集合名称 "${collection}": ${error.message}`);
      }
    }

    // 继续处理权限同步...
  }
}
```

## 安全最佳实践

1. **始终验证用户输入**: 使用 `validateCollection` 验证所有来自用户的集合名称
2. **使用白名单**: 当可能时，使用 `allowedCollections` 选项限制可访问的集合
3. **URL 编码输出**: 使用返回的 `sanitized` 字段（URL 编码）来构造 API 调用
4. **系统集合保护**: 默认情况下不允许访问系统集合，除非明确需要
5. **错误处理**: 捕获验证错误并向用户返回友好的错误消息

## 性能考虑

- 验证器针对性能进行了优化，可以在毫秒级处理数千个验证
- 对于批量操作，使用 `validateCollections` 而不是循环调用 `validateCollection`
- 缓存白名单集合以提高重复验证的性能

## 测试

运行测试套件：

```bash
npm test -- src/endpoints/permission-sync/utils/__tests__/collection-validator.test.ts
```

测试覆盖：
- 基础验证（格式、长度、空值）
- 路径穿越攻击（多种编码格式）
- SQL 注入（常见注入模式）
- XSS 攻击（脚本标签、事件处理器）
- Null 字节注入
- 危险字符检测
- 系统集合保护
- 白名单验证
- 批量验证
- 边界条件（Unicode、控制字符）
- 复杂攻击向量（混合攻击、多层编码）
- 性能测试

## 示例

### 阻止路径穿越攻击

```typescript
const result = validateCollection('../etc/passwd');
// { isValid: false, errorCode: 'PATH_TRAVERSAL_DETECTED', ... }
```

### 阻止 SQL 注入

```typescript
const result = validateCollection("users'; DROP TABLE users--");
// { isValid: false, errorCode: 'SQL_INJECTION_DETECTED', ... }
```

### 阻止 XSS 攻击

```typescript
const result = validateCollection('<script>alert(1)</script>');
// { isValid: false, errorCode: 'XSS_DETECTED', ... }
```

### 允许有效集合

```typescript
const result = validateCollection('my_data_2024');
// { isValid: true, normalized: 'my_data_2024', sanitized: 'my_data_2024', error: '' }
```

## 版本历史

- v1.0.0 (2026-04-10): 初始版本，包含完整的安全验证功能
