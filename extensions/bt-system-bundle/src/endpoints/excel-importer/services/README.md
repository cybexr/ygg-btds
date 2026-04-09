# ImportJobRunner 使用指南

## 概述

`ImportJobRunner` 是一个高性能的异步数据导入服务，用于处理大批量数据的导入任务，提供任务状态跟踪、批处理、错误管理和性能监控功能。

## 核心功能

### 1. 任务管理
- 创建导入任务
- 启动、暂停、恢复、取消任务
- 任务状态跟踪（pending, running, completed, failed, cancelled, paused）

### 2. 批处理
- 默认每批处理 1000 条数据（可配置）
- 事务支持，确保数据一致性
- 自动批处理优化

### 3. 错误处理
- 详细的错误记录（行号、字段、错误类型）
- 错误严重级别分类（info, warning, error, critical）
- 错误摘要生成

### 4. 进度跟踪
- 实时进度更新（0-100%）
- 预计完成时间计算
- 进度回调通知

### 5. 任务队列
- 优先级队列管理
- 并发控制（默认最多 3 个并发任务）
- 自动队列处理

### 6. 性能监控
- 批处理时间统计
- 平均处理时间计算
- 总执行时间跟踪

## 基本使用

### 初始化

```typescript
import { ImportJobRunner } from './services/import-job-runner';
import { Knex } from 'knex';

// 创建 runner 实例
const runner = new ImportJobRunner(database, 3); // 最大 3 个并发任务
```

### 创建导入任务

```typescript
const config = {
  jobIdentifier: 'import-20240408-001',
  datasetRegistryId: 1,
  sourceFileName: 'data.xlsx',
  fileSizeBytes: 2048000,
  totalRows: 10000,
  batchSize: 1000, // 可选，默认 1000
  importOptions: {
    skipValidation: false,
    updateOnDuplicate: true
  },
  createdUserId: 1
};

const jobId = await runner.createImportJob(config);
```

### 启动导入任务

```typescript
// 准备数据
const data = Array.from({ length: 10000 }, (_, i) => ({
  row_number: i + 1,
  sheet_name: 'Sheet1',
  data: {
    id: i + 1,
    name: `Item ${i + 1}`,
    value: Math.random() * 100
  }
}));

// 定义进度回调
const onProgress = (progress) => {
  console.log(`进度: ${progress.progress}%`);
  console.log(`已处理: ${progress.processedRows}/${progress.totalRows}`);
  console.log(`成功: ${progress.successRows}, 失败: ${progress.failedRows}`);
};

// 启动任务
const result = await runner.startImportJob(
  jobId,
  data,
  'bt_custom_dataset_001',
  onProgress
);

console.log('导入完成:', result);
```

### 任务控制

```typescript
// 暂停任务
await runner.pauseJob(jobId);

// 恢复任务
const remainingData = data.slice(processedRows);
await runner.resumeJob(jobId, remainingData, 'bt_custom_dataset_001', onProgress);

// 取消任务
await runner.cancelJob(jobId);

// 获取任务进度
const progress = await runner.getJobProgress(jobId);
```

### 任务队列

```typescript
// 添加任务到队列（自动按优先级处理）
await runner.enqueueJob(
  jobId,
  data,
  'bt_custom_dataset_001',
  onProgress,
  priority // 数字越大优先级越高
);

// 查看队列状态
console.log('队列中的任务:', runner.getQueueLength());
console.log('运行中的任务:', runner.getActiveJobCount());
```

## 高级功能

### 自定义批处理大小

```typescript
const config = {
  // ...其他配置
  batchSize: 500 // 每批处理 500 条
};
```

### 错误处理

```typescript
// 错误会自动记录到 bt_import_errors 表
// 可以查询错误详情
const errors = await database('bt_import_errors')
  .where('import_job_id', jobId)
  .orderBy('created_at', 'desc')
  .limit(100);

// 按严重级别过滤
const criticalErrors = await database('bt_import_errors')
  .where('import_job_id', jobId)
  .where('severity', 'critical');
```

### 性能监控

```typescript
// 获取性能指标
const metrics = runner.getPerformanceMetrics(jobId);
if (metrics) {
  console.log('平均批处理时间:', metrics.averageBatchTime, 'ms');
  console.log('总执行时间:', metrics.totalDuration, 'ms');
}
```

### 清理资源

```typescript
// 任务完成后清理
await runner.cleanupJob(jobId);
```

## 数据库表结构

### bt_import_jobs
存储导入任务的状态和进度信息。

### bt_import_errors
存储详细的错误信息。

### bt_action_audit_logs
存储审计日志，记录所有导入操作。

## 错误类型

系统会自动识别以下错误类型：

- `constraint_violation` - 约束违反（唯一键、外键等）
- `null_violation` - 非空约束违反
- `foreign_key_violation` - 外键约束违反
- `format_error` - 格式错误
- `length_violation` - 长度超限
- `unknown_error` - 未知错误

## 性能优化建议

1. **批处理大小**：根据数据量和系统资源调整批次大小
2. **并发控制**：根据服务器性能调整最大并发任务数
3. **索引优化**：确保目标表有适当的索引
4. **事务大小**：大批量数据考虑分批提交事务

## 监控和调试

```typescript
// 监控任务状态
setInterval(async () => {
  const activeCount = runner.getActiveJobCount();
  const queueLength = runner.getQueueLength();

  console.log(`活动任务: ${activeCount}, 队列任务: ${queueLength}`);
}, 5000);
```

## 完整示例

```typescript
import { ImportJobRunner } from './services/import-job-runner';

async function importLargeDataset(database: Knex, fileData: any[]) {
  const runner = new ImportJobRunner(database, 3);

  // 创建任务
  const config = {
    jobIdentifier: `import-${Date.now()}`,
    sourceFileName: 'large-dataset.xlsx',
    fileSizeBytes: fileData.length * 1024,
    totalRows: fileData.length,
    batchSize: 1000,
    createdUserId: 1
  };

  const jobId = await runner.createImportJob(config);

  // 准备数据
  const batchData = fileData.map((row, index) => ({
    row_number: index + 1,
    data: row
  }));

  // 定义进度回调
  const onProgress = (progress) => {
    console.log(`[${new Date().toISOString()}] 进度: ${progress.progress}%`);
    if (progress.errorSummary) {
      console.warn('错误:', progress.errorSummary);
    }
  };

  try {
    // 启动导入
    const result = await runner.startImportJob(
      jobId,
      batchData,
      'bt_custom_dataset_001',
      onProgress
    );

    console.log('导入完成:', {
      总行数: result.totalRows,
      成功: result.successRows,
      失败: result.failedRows,
      耗时: `${result.duration}ms`
    });

    // 性能分析
    const metrics = runner.getPerformanceMetrics(jobId);
    if (metrics) {
      console.log('性能指标:', metrics);
    }

    return result;
  } catch (error) {
    console.error('导入失败:', error);
    throw error;
  } finally {
    await runner.cleanupJob(jobId);
  }
}
```

## 最佳实践

1. **合理的批处理大小**：默认 1000 条/批适合大多数场景
2. **错误处理**：实现错误重试机制
3. **进度反馈**：为用户提供实时进度更新
4. **资源清理**：任务完成后及时清理资源
5. **监控**：监控任务队列和性能指标
6. **事务管理**：合理使用事务确保数据一致性

## 故障排查

### 任务卡住
- 检查数据库连接
- 查看任务状态
- 检查错误日志

### 性能问题
- 调整批处理大小
- 减少并发任务数
- 检查数据库索引
- 查看性能指标

### 内存问题
- 减少批处理大小
- 限制并发任务数
- 分批处理大数据文件
