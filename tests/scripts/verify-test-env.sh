#!/bin/bash

# E2E 测试环境验证脚本
# 用于检查 Docker 测试环境是否正常运行

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "BTDMS E2E 测试环境验证"
echo "=========================================="

# 1. 检查 Docker 容器状态
echo -e "\n📦 检查 Docker 容器状态..."

if ! docker ps &> /dev/null; then
    echo -e "${RED}❌ Docker 未运行${NC}"
    exit 1
fi

# 检查测试容器
CONTAINERS=("btdms-test-directus" "btdms-test-db")
ALL_RUNNING=true

for container in "${CONTAINERS[@]}"; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${GREEN}✅${NC} ${container} 运行中"
    else
        echo -e "${RED}❌${NC} ${container} 未运行"
        ALL_RUNNING=false
    fi
done

if [ "$ALL_RUNNING" = false ]; then
    echo -e "\n${RED}❌ 测试容器未完全启动${NC}"
    echo "请运行: docker-compose -f docker-compose.test.yml up -d"
    exit 1
fi

# 2. 检查 Directus 健康状态
echo -e "\n🏥 检查 Directus 健康状态..."

BASE_URL="${TEST_BASE_URL:-http://localhost:8080}"
MAX_RETRIES=10
RETRY_DELAY=3

for i in $(seq 1 $MAX_RETRIES); do
    if curl -f -s "${BASE_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} Directus 健康检查通过"
        break
    else
        if [ $i -eq $MAX_RETRIES ]; then
            echo -e "${RED}❌${NC} Directus 健康检查失败"
            exit 1
        fi
        echo -e "${YELLOW}⏳${NC} 等待 Directus 就绪... ($i/$MAX_RETRIES)"
        sleep $RETRY_DELAY
    fi
done

# 3. 检查数据库连接
echo -e "\n🗄️  检查数据库连接..."

DB_CONTAINER="btdms-test-db"
if docker exec $DB_CONTAINER pg_isready -U directus > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} 数据库连接正常"
else
    echo -e "${RED}❌${NC} 数据库连接失败"
    exit 1
fi

# 4. 检查元数据表
echo -e "\n📋 检查核心元数据表..."

TABLE_EXISTS=$(docker exec $DB_CONTAINER psql -U directus -d btdms_test -tAc "
    SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'bt_dataset_registry'
    );
")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo -e "${GREEN}✅${NC} 元数据表 bt_dataset_registry 存在"
else
    echo -e "${RED}❌${NC} 元数据表 bt_dataset_registry 不存在"
    exit 1
fi

# 5. 检查测试用户
echo -e "\n👥 检查测试用户..."

USER_COUNT=$(docker exec $DB_CONTAINER psql -U directus -d btdms_test -tAc "
    SELECT COUNT(*) FROM directus_users
    WHERE email LIKE '%@test.btdms.local';
")

if [ "$USER_COUNT" -ge 3 ]; then
    echo -e "${GREEN}✅${NC} 测试用户已创建 ($USER_COUNT 个)"
else
    echo -e "${YELLOW}⚠️${NC} 测试用户未完全创建 ($USER_COUNT/3)"
fi

# 6. 检查测试资产
echo -e "\n📁 检查测试资产..."

ASSET_DIR="./tests/assets/mock_data"
if [ -d "$ASSET_DIR" ]; then
    FILE_COUNT=$(find $ASSET_DIR -name "*.xlsx" -o -name "*.xls" | wc -l)
    echo -e "${GREEN}✅${NC} 测试资产目录存在 ($FILE_COUNT 个 Excel 文件)"
else
    echo -e "${YELLOW}⚠️${NC} 测试资产目录不存在: $ASSET_DIR"
fi

# 7. 检查环境变量
echo -e "\n🔧 检查环境变量..."

REQUIRED_VARS=("TEST_BASE_URL")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    echo -e "${GREEN}✅${NC} 环境变量已配置"
else
    echo -e "${YELLOW}⚠️${NC} 缺少环境变量: ${MISSING_VARS[*]}"
    echo "将使用默认值: TEST_BASE_URL=${BASE_URL}"
fi

# 8. Playwright 测试（可选）
echo -e "\n🎭 检查 Playwright 安装..."

if command -v npx &> /dev/null; then
    echo -e "${GREEN}✅${NC} npx 可用"
else
    echo -e "${RED}❌${NC} Node.js/npm 未安装"
    exit 1
fi

# 总结
echo -e "\n=========================================="
echo -e "${GREEN}✅ 测试环境验证通过${NC}"
echo -e "=========================================="
echo -e "\n📊 环境信息:"
echo -e "  Directus URL: ${BASE_URL}"
echo -e "  测试用户: manager@test.btdms.local"
echo -e "  测试密码: password"
echo -e "\n🚀 下一步操作:"
echo -e "  运行测试: cd tests/e2e && npx playwright test"
echo -e "  查看报告: npx playwright show-report"
echo ""
