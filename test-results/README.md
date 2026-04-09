# E2E 测试结果报告

## 测试执行信息

- **执行时间**: {{EXECUTION_TIME}}
- **测试环境**: {{TEST_ENV}}
- **基础 URL**: {{BASE_URL}}
- **浏览器**: {{BROWSER}}
- **并行度**: {{WORKERS}}

## 测试结果摘要

### 总体统计

- **总测试数**: {{TOTAL_TESTS}}
- **通过数**: {{PASSED_TESTS}}
- **失败数**: {{FAILED_TESTS}}
- **跳过数**: {{SKIPPED_TESTS}}
- **通过率**: {{PASS_RATE}}%

### 测试套件结果

| 测试套件 | 状态 | 通过 | 失败 | 耗时 |
|---------|------|------|------|------|
| 导入流程测试 | {{IMPORT_FLOW_STATUS}} | {{IMPORT_FLOW_PASSED}} | {{IMPORT_FLOW_FAILED}} | {{IMPORT_FLOW_DURATION}} |
| 权限流程测试 | {{PERMISSION_FLOW_STATUS}} | {{PERMISSION_FLOW_PASSED}} | {{PERMISSION_FLOW_FAILED}} | {{PERMISSION_FLOW_DURATION}} |
| 环境检查测试 | {{ENV_CHECK_STATUS}} | {{ENV_CHECK_PASSED}} | {{ENV_CHECK_FAILED}} | {{ENV_CHECK_DURATION}} |

## 详细测试结果

### 导入流程测试

#### 管理员登录验证
- [ ] 管理员应该能够成功登录
- [ ] 管理员应该具有管理员权限

#### 数据集注册和导入准备
- [ ] 应该能够创建数据集注册
- [ ] 应该能够查询数据集列表
- [ ] 应该能够验证 Excel 测试文件存在

#### 权限分配
- [ ] 应该能够为库著用户分配数据集权限
- [ ] 应该能够同步权限到 Directus
- [ ] 库著用户应该具有数据集的读取权限

#### 库著用户登录和可见性验证
- [ ] 库著用户应该能够成功登录
- [ ] 库著用户应该能够看到已授权的数据集
- [ ] 库著用户应该能够查看数据集详情

#### 数据浏览功能验证
- [ ] 库著用户应该能够查询集合字段
- [ ] 库著用户应该能够查询集合数据
- [ ] 库著用户应该具有正确的读取权限

#### UI 界面测试
- [ ] 管理员应该能够访问后台界面
- [ ] 管理员应该能够看到数据集管理模块
- [ ] 库著用户应该能够访问后台界面
- [ ] 库著用户应该能够看到已授权的数据集
- [ ] 库著用户应该能够浏览数据集内容

### 权限流程测试

#### 用户角色验证
- [ ] 管理员应该具有 ds-manager 角色
- [ ] 库著用户应该具有 ds-descriptor 角色
- [ ] 库查用户应该具有 ds-reader 角色

#### 权限分配流程
- [ ] 应该能够为库著用户分配编辑权限
- [ ] 应该能够为库查用户分配只读权限
- [ ] 应该能够查询用户-库权限列表

#### 权限同步验证
- [ ] 应该能够预览权限变更
- [ ] 应该能够执行权限同步
- [ ] 同步后应该能够验证权限已创建

#### 库著用户权限验证
- [ ] 库著用户应该能够读取数据集
- [ ] 库著用户应该能够查看数据集详情
- [ ] 库著用户应该能够创建数据集注册
- [ ] 库著用户应该能够更新数据集信息

#### 库查用户只读权限验证
- [ ] 库查用户应该能够读取数据集
- [ ] 库查用户应该能够查看数据集详情
- [ ] 库查用户不应该能够创建数据集
- [ ] 库查用户不应该能够删除数据集

## 性能指标

| 操作 | 平均耗时 | 最大耗时 | 最小耗时 |
|------|----------|----------|----------|
| 用户登录 | {{LOGIN_AVG}} | {{LOGIN_MAX}} | {{LOGIN_MIN}} |
| 数据集查询 | {{QUERY_AVG}} | {{QUERY_MAX}} | {{QUERY_MIN}} |
| 权限同步 | {{SYNC_AVG}} | {{SYNC_MAX}} | {{SYNC_MIN}} |
| UI 导航 | {{NAV_AVG}} | {{NAV_MAX}} | {{NAV_MIN}} |

## 失败测试详情

### 测试用例: {{FAILED_TEST_1}}
- **文件**: {{FAILED_FILE_1}}
- **错误**: {{FAILED_ERROR_1}}
- **截图**: {{FAILED_SCREENSHOT_1}}
- **日志**: {{FAILED_LOG_1}}

## 建议和改进

### 测试环境
- {{ENV_RECOMMENDATION_1}}
- {{ENV_RECOMMENDATION_2}}

### 测试代码
- {{CODE_RECOMMENDATION_1}}
- {{CODE_RECOMMENDATION_2}}

### 系统功能
- {{SYSTEM_RECOMMENDATION_1}}
- {{SYSTEM_RECOMMENDATION_2}}

## 附录

### 测试环境配置
```yaml
Directus URL: {{DIRECTUS_URL}}
数据库: PostgreSQL 16
测试用户: 3 个
测试数据集: {{DATASET_COUNT}} 个
```

### 测试执行命令
```bash
{{TEST_COMMAND}}
```

### 相关链接
- [测试报告](./e2e-report/index.html)
- [测试日志](./e2e-results.log)
- [截图目录](./screenshots/)
