# 测试资产说明

此目录包含 E2E 测试所需的 Mock 数据文件。

## 文件清单

### 1. 完美规范的 Excel 文件
- **文件名**: `perfect_sample.xlsx`
- **用途**: 测试正常导入流程
- **数据**: 包含 100 行规范数据，涵盖常见数据类型

### 2. 大批量数据文件
- **文件名**: `large_dataset.xlsx`
- **用途**: 测试大数据量导入性能
- **数据**: 包含 10,000 行数据，用于验证异步导入机制

### 3. 异常格式文件
- **文件名**: `malformed_data.xlsx`
- **用途**: 测试错误处理和数据验证
- **数据**: 包含缺失值、类型错误、空行等异常情况

### 4. 多类型字段文件
- **文件名**: `mixed_types.xlsx`
- **用途**: 测试类型推断和字段映射
- **数据**: 包含文本、数字、日期、布尔值等多种类型

## 文件生成方法

这些测试文件可以使用 Python 脚本生成：

```python
import pandas as pd
import numpy as np

# 生成完美样本
df = pd.DataFrame({
    'name': [f'用户{i}' for i in range(1, 101)],
    'email': [f'user{i}@example.com' for i in range(1, 101)],
    'age': np.random.randint(18, 65, 100),
    'score': np.random.rand(100) * 100,
    'active': np.random.choice([True, False], 100),
    'created_at': pd.date_range('2024-01-01', periods=100, freq='H')
})
df.to_excel('perfect_sample.xlsx', index=False)
```

## 文件位置

测试文件应在运行测试前准备完毕，放置在 `tests/assets/mock_data/` 目录下。
