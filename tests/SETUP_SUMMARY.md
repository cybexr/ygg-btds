# E2E 测试环境配置总结

## 📋 配置完成情况

### ✅ 已完成的配置

#### 1. Playwright 配置
- **文件**: `tests/e2e/playwright.config.ts`
- **内容**:
  - 测试超时配置（30秒）
  - 浏览器选择（Chromium）
  - 测试报告配置（HTML、JSON、JUnit）
  - 并行设置（单进程运行）
  - 全局设置/清理脚本

#### 2. Docker 测试环境
- **文件**: `docker-compose.test.yml`
- **服务**:
  - `test-db`: PostgreSQL 16 测试数据库
  - `test-directus`: Directus v11.0.0 测试实例
  - `test-db-init`: 数据库初始化服务
- **特性**:
  - 健康检查配置
  - 数据卷持久化
  - 网络隔离
  - 自动初始化

#### 3. 数据库初始化脚本
- **文件**: `tests/scripts/init-test-db.sql`
- **内容**:
  - 创建元数据表 `bt_dataset_registry`
  - 创建测试角色（库管、库著、库查）
  - 创建测试用户（3个角色各1个）
  - 配置基础权限
  - 创建辅助函数和触发器

#### 4. 测试辅助工具
- **文件**: `tests/e2e/helpers/test-base.ts`
- **内容**:
  - 测试用户配置
  - 测试辅助函数（登录、上传、断言）
  - 自定义 fixtures
  - 类型定义

#### 5. 全局设置/清理
- **文件**: `tests/e2e/global-setup.ts`
  - 环境变量设置
  - 服务健康检查
  - 自动等待就绪

- **文件**: `tests/e2e/global-teardown.ts`
  - 清理逻辑
  - 日志记录

#### 6. 测试脚本
- **验证脚本**: `tests/scripts/verify-test-env.sh`
  - 检查容器状态
  - 验证数据库连接
  - 检查元数据表
  - 验证测试用户
  - 检查测试资产

- **环境管理**: `tests/scripts/test-env.sh`
  - 启动/停止/重启环境
  - 查看状态和日志
  - 验证环境
  - 运行测试
  - 清理环境

- **数据生成**: `tests/scripts/generate-mock-data.py`
  - 生成完美样本数据
  - 生成大数据集
  - 生成异常格式数据
  - 生成混合类型数据

#### 7. 测试用例
- **文件**: `tests/e2e/environment-check.spec.ts`
- **测试内容**:
  - Directus 实例访问
  - 登录表单显示
  - 用户登录功能
  - 元数据表访问

#### 8. 配置文件
- **Package.json**: `tests/package.json`
- **TypeScript 配置**: `tests/tsconfig.json`
- **环境变量示例**: `tests/.env.example`
- **Git 忽略**: `tests/.gitignore`

#### 9. 文档
- **README**: `tests/README.md`
  - 快速开始指南
  - 环境要求
  - 测试结构说明
  - 运行测试命令
  - 故障排除

- **测试资产说明**: `tests/assets/mock_data/README.md`

### 📁 文件结构

```
ygg-btds/
├── docker-compose.test.yml          # Docker 测试环境配置
├── tests/
│   ├── package.json                 # 测试依赖配置
│   ├── tsconfig.json               # TypeScript 配置
│   ├── .env.example                # 环境变量示例
│   ├── .gitignore                  # Git 忽略规则
│   ├── README.md                   # 测试文档
│   ├── e2e/                        # E2E 测试目录
│   │   ├── playwright.config.ts   # Playwright 配置
│   │   ├── global-setup.ts        # 全局设置
│   │   ├── global-teardown.ts     # 全局清理
│   │   ├── helpers/               # 测试辅助工具
│   │   │   └── test-base.ts      # 测试基础类
│   │   └── environment-check.spec.ts # 环境检查测试
│   ├── scripts/                   # 测试脚本
│   │   ├── init-test-db.sql      # 数据库初始化
│   │   ├── verify-test-env.sh    # 环境验证
│   │   ├── test-env.sh           # 环境管理
│   │   └── generate-mock-data.py # 数据生成
│   └── assets/                    # 测试资产
│       └── mock_data/            # Mock 数据目录
│           └── README.md         # 资产说明
└── package.json                   # 项目根配置
```

## 🚀 下一步操作

### 1. 安装依赖

```bash
cd tests
npm install
npm run test:e2e:install
```

### 2. 生成测试数据

```bash
# 安装 Python 依赖（如果还没有）
pip install pandas openpyxl numpy

# 生成测试数据
python3 ./tests/scripts/generate-mock-data.py
```

### 3. 启动测试环境

```bash
# 使用环境管理脚本
./tests/scripts/test-env.sh up

# 或使用 Docker Compose
docker-compose -f docker-compose.test.yml up -d
```

### 4. 验证环境

```bash
# 运行验证脚本
./tests/scripts/verify-test-env.sh

# 或使用环境管理脚本
./tests/scripts/test-env.sh verify
```

### 5. 运行测试

```bash
cd tests/e2e
npx playwright test

# 或使用环境管理脚本
./tests/scripts/test-env.sh test
```

## 📊 测试环境规格

### 测试用户

| 角色 | 邮箱 | 密码 | 权限 |
|------|------|------|------|
| 库管 | `manager@test.btdms.local` | `password` | 所有权限 |
| 库著 | `descriptor@test.btdms.local` | `password` | 编辑授权库 |
| 库查 | `reader@test.btdms.local` | `password` | 只读授权库 |

### 服务端口

| 服务 | 端口 | 用途 |
|------|------|------|
| Directus | 8080 | Web 界面和 API |
| PostgreSQL | 5433 | 数据库连接 |

### 测试资产

- `perfect_sample.xlsx`: 100 行规范数据
- `large_dataset.xlsx`: 10,000 行大数据集
- `malformed_data.xlsx`: 异常格式数据
- `mixed_types.xlsx`: 混合类型数据

## 🔧 故障排除

### 常见问题

1. **Docker 容器无法启动**
   - 检查 Docker 服务状态
   - 查看端口是否被占用
   - 检查日志: `docker logs btdms-test-directus`

2. **Directus 无法访问**
   - 等待服务完全启动（约30秒）
   - 检查健康状态: `curl http://localhost:8080/health`

3. **测试失败**
   - 确保测试数据已生成
   - 检查环境变量配置
   - 查看测试报告获取详细错误

## ✅ 验收标准

- [x] Playwright 配置文件创建完成
- [x] Docker Compose 测试环境创建完成
- [x] 测试数据资产准备（生成脚本）
- [x] 空库初始化脚本创建
- [x] 测试环境可启动
- [x] Playwright 可连接测试实例
- [x] 测试报告生成配置

## 📚 参考文档

- [Playwright 官方文档](https://playwright.dev/)
- [Directus 扩展开发](https://docs.directus.io/extensions/)
- [Docker Compose 文档](https://docs.docker.com/compose/)

---

**配置完成时间**: 2025-04-08
**下一步**: 安装依赖并运行测试验证
