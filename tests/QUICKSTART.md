# E2E 测试环境快速入门

## 5 分钟快速开始

### 1. 安装依赖（2 分钟）

```bash
# 进入测试目录
cd tests

# 安装 Node.js 依赖
npm install

# 安装 Playwright 浏览器
npm run test:e2e:install
```

### 2. 生成测试数据（1 分钟）

```bash
# 安装 Python 依赖（首次运行）
pip install pandas openpyxl numpy

# 生成测试数据
python3 ./scripts/generate-mock-data.py
```

### 3. 启动测试环境（1 分钟）

```bash
# 方法一：使用环境管理脚本（推荐）
./scripts/test-env.sh up

# 方法二：使用 Docker Compose
docker-compose -f docker-compose.test.yml up -d
```

### 4. 验证环境（30 秒）

```bash
# 方法一：使用环境管理脚本
./scripts/test-env.sh verify

# 方法二：直接运行验证脚本
bash ./scripts/verify-test-env.sh
```

### 5. 运行测试（30 秒）

```bash
# 方法一：使用环境管理脚本
./scripts/test-env.sh test

# 方法二：直接运行 Playwright
cd e2e
npx playwright test
```

## 🎯 测试结果

测试完成后，查看结果：

```bash
# 查看 HTML 报告
npm run test:e2e:report

# 或使用 Playwright 命令
npx playwright show-report
```

## 📝 测试用户

测试时使用以下用户凭证：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | `manager@test.btdms.local` | `password` |
| 库著 | `descriptor@test.btdms.local` | `password` |
| 库查 | `reader@test.btdms.local` | `password` |

## 🛑 停止环境

```bash
# 方法一：使用环境管理脚本
./scripts/test-env.sh down

# 方法二：使用 Docker Compose
docker-compose -f docker-compose.test.yml down
```

## 🔧 环境管理脚本

```bash
./scripts/test-env.sh [命令]

可用命令:
  up        启动测试环境
  down      停止测试环境
  restart   重启测试环境
  status    查看环境状态
  logs      查看服务日志
  verify    验证环境配置
  clean     清理环境（删除数据）
  init      初始化测试数据库
  test      运行 E2E 测试
  help      显示帮助信息
```

## 📊 环境变量

创建 `.env.test.local` 文件自定义配置：

```bash
# Directus URL
TEST_BASE_URL=http://localhost:8080

# 数据库配置
TEST_DB_HOST=localhost
TEST_DB_PORT=5433
```

## 🐛 遇到问题？

### 端口被占用

```bash
# 检查端口占用
lsof -i :8080
lsof -i :5433

# 修改 docker-compose.test.yml 中的端口映射
```

### Docker 问题

```bash
# 查看容器状态
docker ps -a | grep btdms

# 查看日志
docker logs btdms-test-directus

# 重启容器
./scripts/test-env.sh restart
```

### 测试失败

```bash
# 以调试模式运行
npm run test:e2e:debug

# 查看详细输出
npx playwright test --reporter=list
```

## 📚 更多信息

详细文档请参考：
- [完整测试文档](./README.md)
- [配置总结](./SETUP_SUMMARY.md)
- [Playwright 官方文档](https://playwright.dev/)

---

**祝你测试愉快！** 🎉
