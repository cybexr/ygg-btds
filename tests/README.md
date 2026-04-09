# E2E 测试环境

基于 Playwright 的端到端测试环境，用于验证 BTDMS 系统的核心业务流程。

## 📋 目录

- [快速开始](#快速开始)
- [环境要求](#环境要求)
- [测试结构](#测试结构)
- [运行测试](#运行测试)
- [测试资产](#测试资产)
- [故障排除](#故障排除)

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装 Node.js 依赖
cd tests
npm install

# 安装 Playwright 浏览器
npm run test:e2e:install
```

### 2. 启动测试环境

```bash
# 启动 Docker 测试环境
docker-compose -f docker-compose.test.yml up -d

# 等待服务启动（约 30 秒）
```

### 3. 验证环境

```bash
# 运行环境验证脚本
bash ./tests/scripts/verify-test-env.sh
```

### 4. 运行测试

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 或者在项目根目录
npm run test:e2e
```

## 📦 环境要求

- **Node.js**: >= 18.0.0
- **Docker**: >= 20.10.0
- **Docker Compose**: >= 2.0.0
- **Python**: >= 3.8 (用于生成测试数据)

## 🏗️ 测试结构

```
tests/
├── e2e/                          # E2E 测试目录
│   ├── playwright.config.ts      # Playwright 配置
│   ├── global-setup.ts           # 全局设置
│   ├── global-teardown.ts        # 全局清理
│   ├── helpers/                  # 测试辅助工具
│   │   └── test-base.ts         # 测试基础类和 fixtures
│   └── *.spec.ts                 # 测试用例文件
├── scripts/                      # 测试脚本
│   ├── init-test-db.sql         # 数据库初始化脚本
│   ├── verify-test-env.sh       # 环境验证脚本
│   └── generate-mock-data.py    # 测试数据生成脚本
├── assets/                       # 测试资产
│   └── mock_data/               # Mock Excel 文件
│       ├── perfect_sample.xlsx  # 完美样本
│       ├── large_dataset.xlsx   # 大数据集
│       ├── malformed_data.xlsx  # 异常数据
│       └── mixed_types.xlsx     # 混合类型
└── test-results/                 # 测试报告（生成）
```

## 🎯 运行测试

### 基本命令

```bash
# 运行所有测试
npm run test:e2e

# 以 UI 模式运行测试（交互式）
npm run test:e2e:ui

# 以 headed 模式运行（显示浏览器）
npm run test:e2e:headed

# 调试模式
npm run test:e2e:debug

# 查看测试报告
npm run test:e2e:report
```

### Playwright 命令

```bash
cd tests/e2e

# 运行特定测试文件
npx playwright test environment-check.spec.ts

# 运行特定测试用例
npx playwright test -g "应该显示登录表单"

# 以特定浏览器运行
npx playwright test --project=chromium

# 显示浏览器（调试用）
npx playwright test --headed

# 调试模式
npx playwright test --debug
```

## 📊 测试资产

### 生成测试数据

```bash
# 生成 Mock Excel 文件
python3 ./tests/scripts/generate-mock-data.py

# 或使用 npm 脚本
npm run test:mock-data
```

### 测试数据文件

| 文件名 | 描述 | 用途 |
|--------|------|------|
| `perfect_sample.xlsx` | 100 行规范数据 | 测试正常导入流程 |
| `large_dataset.xlsx` | 10,000 行数据 | 测试大数据量导入 |
| `malformed_data.xlsx` | 包含异常格式 | 测试错误处理 |
| `mixed_types.xlsx` | 多种字段类型 | 测试类型推断 |

### 测试用户

| 邮箱 | 角色 | 密码 | 权限 |
|------|------|------|------|
| `manager@test.btdms.local` | 库管 | `password` | 所有权限 |
| `descriptor@test.btdms.local` | 库著 | `password` | 编辑授权库 |
| `reader@test.btdms.local` | 库查 | `password` | 只读授权库 |

## 🧪 测试用例

### 当前测试

- **environment-check.spec.ts**: 验证测试环境是否正常工作

### 计划中的测试

- **excel-import.spec.ts**: 测试 Excel 导入完整流程
- **user-permission.spec.ts**: 测试用户权限管理
- **dataset-operations.spec.ts**: 测试数据集 CRUD 操作
- **cockpit-dashboard.spec.ts**: 测试驾驶舱仪表板

## 🔧 环境变量

创建 `.env.test.local` 文件配置测试环境变量：

```bash
# Directus 测试实例 URL
TEST_BASE_URL=http://localhost:8080

# 数据库连接
TEST_DB_HOST=localhost
TEST_DB_PORT=5433
TEST_DB_USER=directus
TEST_DB_PASSWORD=directus_test_password
TEST_DB_NAME=btdms_test
```

## 🐛 故障排除

### Docker 容器无法启动

```bash
# 查看容器日志
docker-compose -f docker-compose.test.yml logs

# 重启容器
docker-compose -f docker-compose.test.yml restart

# 清理并重新启动
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d
```

### Directus 无法访问

```bash
# 检查 Directus 健康状态
curl http://localhost:8080/health

# 检查容器状态
docker ps | grep btdms

# 查看 Directus 日志
docker logs btdms-test-directus
```

### 测试浏览器安装失败

```bash
# 手动安装 Playwright 浏览器
cd tests
npx playwright install --with-deps

# 仅安装 Chromium
npx playwright install chromium
```

### 数据库初始化失败

```bash
# 手动运行初始化脚本
docker exec -i btdms-test-db psql -U directus -d btdms_test < tests/scripts/init-test-db.sql

# 检查数据库连接
docker exec -it btdms-test-db psql -U directus -d btdms_test
```

## 📝 开发指南

### 添加新测试

1. 在 `tests/e2e/` 目录下创建新的 `.spec.ts` 文件
2. 从 `./helpers/test-base` 导入测试工具
3. 使用 `test` 或 `test.describe` 定义测试用例
4. 运行测试验证

### 示例测试

```typescript
import { test, expect, testUsers, TestHelpers } from './helpers/test-base';

test.describe('新功能测试', () => {
  test('应该能够执行某个操作', async ({ page }) => {
    // 1. 登录
    await TestHelpers.login(page, testUsers.manager);

    // 2. 执行操作
    await page.click('button[data-test="action"]');

    // 3. 验证结果
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

### 最佳实践

- 每个测试应该独立运行，不依赖其他测试
- 使用语义化的选择器（如 `data-test` 属性）
- 添加清晰的测试描述和断言消息
- 测试失败时应该生成有用的调试信息
- 避免硬编码等待时间，使用 Playwright 的自动等待

## 📚 参考资料

- [Playwright 官方文档](https://playwright.dev/)
- [Directus 扩展开发指南](https://docs.directus.io/extensions/)
- [项目 PRD 文档](./../../README.md)

## 🤝 贡献

添加新的测试用例时，请确保：

1. 测试可以独立运行
2. 测试描述清晰明确
3. 使用适当的等待和断言
4. 更新此 README 文档

---

**最后更新**: 2025-04-08
