# Excel 导入服务使用指南

## 概述

Excel 导入服务提供了一套完整的 Excel 文件解析、类型推断和字段映射功能，用于将 Excel 数据导入到 Directus 集合中。

## 安装依赖

```bash
npm install xlsx@^0.18.0
npm install --save-dev vitest
```

## 核心服务

### 1. Excel 解析服务 (excel-parser.ts)

提供 Excel 文件的解析、验证和数据清理功能。

#### 主要功能

- **parseExcelFile**: 解析 Excel 文件并提取数据
- **getSheetNames**: 获取工作表名称列表
- **validateExcelFile**: 验证文件格式
- **getFileInfo**: 获取文件元信息
- **sanitizeCellValue**: 清理单元格数据
- **sanitizeData**: 批量清理数据
- **removeEmptyRows**: 移除空行
- **removeEmptyColumns**: 移除空列

#### 使用示例

```typescript
import { parseExcelFile, validateExcelFile } from './services';

// 验证文件
const validation = validateExcelFile(file);
if (!validation.valid) {
  console.error(validation.error);
  return;
}

// 解析文件
const result = await parseExcelFile(file, {
  max_preview_rows: 10,
  max_sheets: 5,
  skip_empty_rows: true,
  header_row: 0
});

// 访问解析结果
console.log('工作表数量:', result.sheet_count);
result.sheets.forEach(sheet => {
  console.log('表头:', sheet.headers);
  console.log('字段映射:', sheet.fields);
  console.log('预览数据:', sheet.preview_data);
});
```

#### 配置选项

```typescript
interface ExcelParserConfig {
  max_preview_rows?: number;    // 最大预览行数 (默认: 10)
  max_sheets?: number;           // 最大工作表数量 (默认: 10)
  skip_empty_rows?: boolean;     // 是否跳过空行 (默认: true)
  header_row?: number;           // 表头行索引 (默认: 0)
  type_inference?: TypeInferenceConfig; // 类型推断配置
}
```

### 2. 类型推断服务 (type-inference.ts)

基于样本数据自动推断字段类型，并提供置信度评分。

#### 支持的类型

- **string**: 文本数据
- **integer**: 整数
- **decimal**: 小数
- **boolean**: 布尔值 (true/false, 是/否, yes/no)
- **datetime**: 日期时间
- **date**: 日期
- **time**: 时间
- **uuid**: UUID 格式
- **json**: JSON 数据

#### 使用示例

```typescript
import { inferFieldType, createFieldMappings, adjustFieldMapping } from './services';

// 推断单个字段类型
const values = ['1', '100', '999', '-42', '0'];
const inference = inferFieldType(values, {
  max_sample_size: 100,
  confidence_threshold: 0.7
});

console.log('类型:', inference.type);        // 'integer'
console.log('置信度:', inference.confidence); // 1.0
console.log('是否可空:', inference.nullable); // false

// 批量创建字段映射
const headers = ['姓名', '年龄', '分数'];
const data = [
  { 姓名: '张三', 年龄: '25', 分数: '95.5' },
  { 姓名: '李四', 年龄: '30', 分数: '87.0' }
];

const mappings = createFieldMappings(headers, data);

// 人工调整映射
const adjusted = adjustFieldMapping(mappings[1], {
  type: FieldType.STRING,
  nullable: true
});
```

#### 类型推断配置

```typescript
interface TypeInferenceConfig {
  max_sample_size?: number;      // 最大样本数量 (默认: 100)
  strict_mode?: boolean;         // 严格模式 (默认: false)
  confidence_threshold?: number; // 置信度阈值 (默认: 0.7)
}
```

## 完整工作流程

### 步骤 1: 上传并验证文件

```typescript
async function handleFileUpload(file: File) {
  // 验证文件格式
  const validation = validateExcelFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // 获取文件信息
  const fileInfo = getFileInfo(file);
  console.log('文件大小:', fileInfo.size_mb, 'MB');

  return fileInfo;
}
```

### 步骤 2: 解析 Excel 文件

```typescript
async function parseUploadedFile(file: File) {
  const result = await parseExcelFile(file, {
    max_preview_rows: 10,
    type_inference: {
      max_sample_size: 100,
      confidence_threshold: 0.8
    }
  });

  // 处理解析结果
  const sheet = result.sheets[0];
  console.log('表头:', sheet.headers);
  console.log('字段映射:', sheet.fields);

  return result;
}
```

### 步骤 3: 调整字段映射

```typescript
function adjustMappings(fields: FieldMapping[]) {
  return fields.map(field => {
    // 根据业务需求调整
    if (field.field_name === 'age') {
      return adjustFieldMapping(field, {
        type: FieldType.INTEGER,
        nullable: false
      });
    }
    return field;
  });
}
```

### 步骤 4: 创建 Directus 集合

```typescript
async function createCollection(collectionName: string, fields: FieldMapping[]) {
  // 使用 Directus SDK 创建集合
  const response = await directus.collections.createOne({
    collection: collectionName,
    meta: {
      display_template: '{{id}}'
    },
    schema: {}
  });

  // 创建字段
  for (const field of fields) {
    await directus.fields.createOne(collectionName, {
      field: field.field_name,
      type: field.type,
      meta: {
        display_name: field.display_name,
        hidden: false
      },
      schema: {
        is_nullable: field.nullable,
        is_primary_key: field.primary_key,
        is_unique: field.unique,
        has_auto_increment: field.primary_key
      }
    });
  }

  return response;
}
```

## 测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- type-inference.test.ts

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行测试 UI
npm run test:ui
```

### 功能验证

运行功能验证脚本：

```bash
node test-services.js
```

## 错误处理

### 常见错误及解决方案

1. **文件格式不支持**
   ```typescript
   const validation = validateExcelFile(file);
   if (!validation.valid) {
     console.error('不支持的文件格式:', validation.error);
   }
   ```

2. **空文件或空工作表**
   ```typescript
   if (result.sheets[0].row_count === 0) {
     console.warn('工作表为空');
   }
   ```

3. **类型推断置信度低**
   ```typescript
   if (inference.confidence < 0.7) {
     console.warn('类型推断置信度低，建议人工确认');
   }
   ```

## 性能优化建议

1. **限制样本数量**: 设置合理的 `max_sample_size` 避免处理过多数据
2. **使用预览**: 只在需要时加载完整数据，默认使用预览模式
3. **批量处理**: 对于大文件，考虑分批处理数据
4. **缓存结果**: 缓存解析结果避免重复处理

## 扩展性

### 添加自定义类型推断

```typescript
function inferCustomType(values: any[]): TypeInferenceResult {
  // 自定义推断逻辑
  return {
    type: FieldType.CUSTOM,
    confidence: 0.9,
    sample_count: values.length,
    nullable: false,
    sample_values: values.slice(0, 5)
  };
}
```

### 添加数据验证规则

```typescript
function validateFieldValue(value: any, type: FieldType): boolean {
  // 自定义验证逻辑
  return true;
}
```

## 许可证

MIT
