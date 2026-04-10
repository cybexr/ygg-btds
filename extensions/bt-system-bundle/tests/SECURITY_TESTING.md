# 安全测试指南

## 概述

本文档描述了 BT 数据集管理系统的安全测试覆盖范围、测试场景和运行方法。

## 测试目标

安全测试套件旨在验证以下安全属性：

1. **身份验证和授权** - 确保 API 端点正确实施访问控制
2. **输入验证** - 防止 SQL 注入、XSS、路径穿越等输入攻击
3. **文件上传安全** - 验证恶意文件检测和文件大小限制
4. **数据完整性** - 确保数据在传输和存储过程中不被篡改

## 测试文件

### Excel 导入安全测试

**文件**: `src/endpoints/excel-importer/__tests__/security.test.ts`

**覆盖的测试场景**:

#### 身份验证和授权
- 未登录用户访问受保护 API (401 验证)
- 普通用户访问管理接口 (403 验证)
- ds-manager 角色访问测试 (200 验证)
- admin 角色访问测试 (200 验证)
- 角色名称篡改攻击（绕过检查）
- 缺失 accountability 的请求拒绝
- user 为 null 的 accountability 拒绝
- role 为数组的攻击尝试拒绝
- role 为对象的攻击尝试拒绝

#### 文件上传安全
- MIME 类型欺骗攻击（伪装成 xlsx 的可执行文件）
- 超大文件上传（超过 10MB 限制）
- 空文件上传
- 无效文件格式上传
- 文件包含宏病毒的场景
- ZIP 炸弹攻击（嵌套压缩文件）
- 路径穿越字符检测

#### 输入验证
- 集合名称中的 SQL 注入尝试
- 集合名称路径穿越攻击（../users）
- 特殊字符注入（单引号、分号、注释符、脚本标签）
- 集合名称格式验证
- 超长集合名称
- Unicode 混淆攻击

### 权限同步安全测试

**文件**: `src/endpoints/permission-sync/__tests__/security.test.ts`

**覆盖的测试场景**:

#### 输入验证
- 非数组的权限同步请求体验证
- 缺失字段和类型错误验证
- 损坏的 JSON 数据解析
- 非法结构数据验证
- SQL 注入 payload 验证
- 路径穿越字符验证
- XSS 攻击向量验证
- null 字节注入验证
- 重复条目检测
- 过长字符串字段验证
- 类型错误字段值验证

#### 数据库安全
- 数据库不可用时的错误处理
- 预览模式强制使用验证
- 当前权限查询错误处理

## 运行测试

### 运行所有安全测试

```bash
cd extensions/bt-system-bundle
npm run test:security
```

### 运行特定安全测试文件

```bash
# Excel 导入安全测试
npm test -- src/endpoints/excel-importer/__tests__/security.test.ts

# 权限同步安全测试
npm test -- src/endpoints/permission-sync/__tests__/security.test.ts
```

### 运行特定测试用例

```bash
# 运行匹配描述的测试
npm test -- -t "应该拒绝包含 SQL 注入的集合名称"

# 运行匹配模式的测试
npm test -- -t "应该拒绝.*SQL 注入"
```

### 生成测试覆盖率报告

```bash
npm run test:coverage
```

## CI/CD 集成

### GitHub Actions 示例

```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd extensions/bt-system-bundle
      - run: npm ci
      - run: npm run test:security
```

## 测试覆盖的攻击向量

### 1. SQL 注入 (SQLi)
- 集合名称注入
- 用户 ID 注入
- Library ID 注入

### 2. 跨站脚本攻击 (XSS)
- 用户 ID XSS
- 模板字段 XSS

### 3. 路径穿越
- 集合名称路径穿越 (../)
- 文件名路径穿越
- Library ID 路径穿越

### 4. 文件上传攻击
- MIME 类型欺骗
- 恶意文件上传（可执行文件、宏病毒）
- ZIP 炸弹
- 超大文件 DoS

### 5. 权限绕过
- 角色名称篡改
- Accountability 对象篡改
- 缺失认证检查

### 6. 输入验证绕过
- null 字节注入
- Unicode 混淆
- 特殊字符注入
- 类型混淆

### 7. DoS 攻击
- 超大 payload
- 重复条目 flooding
- 超长字符串

## 安全测试最佳实践

### 1. 测试数据隔离

使用独立的测试数据库，避免影响生产数据：

```typescript
const testDatabase = createTestDatabase();
```

### 2. Mock 外部依赖

Mock 文件系统、网络请求等外部依赖：

```typescript
vi.mock('../services/file-scanner', () => ({
  scanFile: vi.fn(),
}));
```

### 3. 清理测试状态

每个测试后清理状态，避免测试间相互影响：

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

### 4. 使用描述性测试名称

测试名称应该清楚描述测试的安全场景：

```typescript
it('应该拒绝包含 SQL 注入的集合名称', async () => {
  // 测试代码
});
```

### 5. 验证错误响应

确保 API 返回适当的错误码和消息：

```typescript
expect(res.status).toHaveBeenCalledWith(400);
expect(res.json).toHaveBeenCalledWith(
  expect.objectContaining({ error: 'INVALID_COLLECTION_NAME' })
);
```

## 测试结果解读

### 成功标准

- 所有测试用例通过
- 测试覆盖率 ≥ 80%
- 无已知安全漏洞未修复

### 失败处理

如果安全测试失败：

1. 检查失败的测试用例
2. 确定是安全问题还是测试问题
3. 修复安全问题或更新测试
4. 重新运行测试验证修复

### 测试覆盖率目标

- 整体覆盖率: ≥ 80%
- 关键安全路径: ≥ 90%
- 输入验证逻辑: 100%

## 持续改进

### 定期审查

- 每月审查安全测试覆盖范围
- 添加新发现的安全场景测试
- 更新测试用例以覆盖新的攻击向量

### 威胁建模

- 定期进行威胁建模会议
- 识别新的安全风险
- 为新风险添加测试用例

### 依赖更新

- 定期更新测试依赖
- 关注安全公告
- 及时修复依赖漏洞

## 故障排除

### 常见问题

**Q: 测试超时失败**
A: 增加测试超时时间或检查测试依赖的异步操作

**Q: Mock 函数未被调用**
A: 检查 Mock 配置和导入路径

**Q: 测试数据库连接失败**
A: 验证测试数据库配置和网络连接

## 参考资源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Vitest 文档](https://vitest.dev/)
- [Supertest 文档](https://github.com/visionmedia/supertest)

## 版本历史

- v1.0.0 (2026-04-09): 初始版本，包含基础安全测试套件
- v1.1.0 (2026-04-09): 扩展测试覆盖，添加文件上传安全和输入验证测试
