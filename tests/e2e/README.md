# E2E 测试环境说明

## 概述

本目录包含 BTDMS 系统的端到端（E2E）测试套件，使用 Playwright 框架编写。测试覆盖核心业务链路，包括导入流程和权限管理。

## 测试架构

### 测试文件结构

```
tests/e2e/
├── helpers/
│   ├── test-base.ts          # 测试基础类和 fixture
│   └── api-helpers.ts        # API 辅助类
├── import-flow.spec.ts       # 导入流程 E2E 测试
├── permission-flow.spec.ts   # 权限流程 E2E 测试
├── environment-check.spec.ts # 环境验证测试
├── playwright.config.ts      # Playwright 配置
├── global-setup.ts           # 全局测试设置
└── global-teardown.ts        # 全局测试清理
```

### 测试覆盖范围

#### 1. 导入流程测试 (`import-flow.spec.ts`)

- **步骤 1**: 管理员登录验证
- **步骤 2**: 数据集注册和导入准备
- **步骤 3**: 权限分配
- **步骤 4**: 库著用户登录和可见性验证
- **步骤 5**: 数据浏览功能验证
- **步骤 6**: UI 界面测试
- **步骤 7**: 清理和隔离测试

#### 2. 权限流程测试 (`permission-flow.spec.ts`)

- **步骤 1**: 用户角色验证
- **步骤 2**: 权限分配流程
- **步骤 3**: 权限同步验证
- **步骤 4**: 库著用户权限验证
- **步骤 5**: 库查用户只读权限验证
- **步骤 6**: 权限隔离验证
- **步骤 7**: UI 权限验证
- **步骤 8**: 权限变更和撤销
- **步骤 9**: 批量权限操作

## 环境要求

### Docker 环境

```bash
# 启动测试环境
docker-compose -f docker-compose.test.yml up -d

# 查看日志
docker-compose -f docker-compose.test.yml logs -f

# 停止测试环境
docker-compose -f docker-compose.test.yml down
```

### 依赖安装

```bash
# 安装 Node.js 依赖
cd tests
npm install

# 安装 Playwright 浏览器
npm run test:e2e:install

# 安装 Python 依赖（用于生成 Mock 数据）
pip3 install pandas openpyxl numpy
```

## 运行测试

### 准备测试数据

```bash
# 生成 Mock Excel 数据
npm run generate-mock-data

# 或使用 Python 脚本
python3 scripts/generate-mock-data.py
```

### 运行测试

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 运行特定测试文件
npx playwright test import-flow.spec.ts

# 以 UI 模式运行测试
npm run test:e2e:ui

# 以 headed 模式运行（显示浏览器窗口）
npm run test:e2e:headed

# 调试模式
npm run test:e2e:debug
```

### 查看测试报告

```bash
# 打开 HTML 测试报告
npm run test:e2e:report
```

## 测试用户

测试环境预设了三个测试用户：

| 角色 | 邮箱 | 密码 | 权限 |
|------|------|------|------|
| 库管 | manager@test.btdms.local | password | 所有数据集的管理权限 |
| 库著 | descriptor@test.btdms.local | password | 授权数据集的编辑和描述权限 |
| 库查 | reader@test.btdms.local | password | 授权数据集的只读权限 |

## 测试数据

### Mock 数据文件

测试数据位于 `tests/assets/mock_data/` 目录：

- `perfect_sample.xlsx`: 完美规范的测试数据（100 行）
- `large_dataset.xlsx`: 大批量测试数据（10,000 行）
- `malformed_data.xlsx`: 异常格式数据
- `mixed_types.xlsx`: 多类型字段数据

### 数据库初始化

测试数据库初始化脚本：`tests/scripts/init-test-db.sql`

种子数据脚本：`tests/scripts/seed-test-data.ts`

## 配置说明

### Playwright 配置

- **基础 URL**: `http://localhost:8080`（可通过 `TEST_BASE_URL` 环境变量覆盖）
- **超时时间**: 30 秒
- **并行执行**: 是（每个测试文件独立运行）
- **重试次数**: 0
- **浏览器**: Chromium

### 环境变量

- `TEST_BASE_URL`: Directus 测试实例 URL
- `TEST_ENV`: 测试环境标识（e2e）
- `NODE_ENV`: Node 环境（test）

## 故障排查

### 测试环境无法启动

```bash
# 检查 Docker 服务状态
docker-compose -f docker-compose.test.yml ps

# 查看服务日志
docker-compose -f docker-compose.test.yml logs test-directus
```

### 测试用户无法登录

```bash
# 重新运行种子数据脚本
npm run test:e2e:seed

# 或手动设置密码
# 进入 Directus 后台重置测试用户密码
```

### Mock 数据缺失

```bash
# 重新生成 Mock 数据
npm run generate-mock-data
```

### 测试超时

- 检查测试环境是否正常运行
- 增加超时时间（修改 `playwright.config.ts`）
- 减少并行测试数量

## 持续集成

### CI/CD 集成

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Start test environment
        run: docker-compose -f docker-compose.test.yml up -d
      - name: Install dependencies
        run: |
          cd tests
          npm install
          npm run test:e2e:install
      - name: Run tests
        run: |
          cd tests
          npm run test:e2e
      - name: Upload test results
        uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: test-results/
```

## 最佳实践

1. **测试隔离**: 每个测试应该独立运行，不依赖其他测试的状态
2. **清理数据**: 测试结束后应该清理创建的数据
3. **使用固定数据**: 使用种子数据确保测试环境一致性
4. **错误处理**: 测试应该验证错误场景，不只是成功场景
5. **维护性**: 保持测试代码清晰，添加必要的注释

## 贡献指南

添加新测试时：

1. 在相应的 `.spec.ts` 文件中添加测试用例
2. 使用 `test.describe()` 组织相关测试
3. 使用 `test.beforeEach()` 和 `test.afterEach()` 进行设置和清理
4. 确保测试独立运行
5. 添加清晰的测试描述和断言

## 参考资源

- [Playwright 官方文档](https://playwright.dev/)
- [Directus 文档](https://docs.directus.io/)
- [测试最佳实践](https://playwright.dev/docs/best-practices)
