#!/bin/bash
# E2E 测试实现验证脚本
# 验证所有测试文件和资产是否正确创建

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================"
echo "E2E 测试实现验证"
echo "======================================${NC}"
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0

# 检查函数
check_item() {
    local description="$1"
    local check_command="$2"

    echo -n "检查: $description ... "

    if eval "$check_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((SUCCESS_COUNT++))
        return 0
    else
        echo -e "${RED}✗${NC}"
        ((FAIL_COUNT++))
        return 1
    fi
}

# 进入测试目录
cd "$(dirname "$0")/.."

echo -e "${BLUE}1. 测试文件验证${NC}"
check_item "import-flow.spec.ts" "[ -f e2e/import-flow.spec.ts ]"
check_item "permission-flow.spec.ts" "[ -f e2e/permission-flow.spec.ts ]"
check_item "environment-check.spec.ts" "[ -f e2e/environment-check.spec.ts ]"
check_item "playwright.config.ts" "[ -f e2e/playwright.config.ts ]"
check_item "global-setup.ts" "[ -f e2e/global-setup.ts ]"
check_item "global-teardown.ts" "[ -f e2e/global-teardown.ts ]"
echo ""

echo -e "${BLUE}2. 辅助工具验证${NC}"
check_item "test-base.ts" "[ -f e2e/helpers/test-base.ts ]"
check_item "api-helpers.ts" "[ -f e2e/helpers/api-helpers.ts ]"
check_item "test-config.ts" "[ -f e2e/helpers/test-config.ts ]"
echo ""

echo -e "${BLUE}3. 测试脚本验证${NC}"
check_item "run-e2e-tests.sh" "[ -f scripts/run-e2e-tests.sh ]"
check_item "seed-test-data.ts" "[ -f scripts/seed-test-data.ts ]"
check_item "verify-test-env.sh" "[ -f scripts/verify-test-env.sh ]"
check_item "generate-mock-data.py" "[ -f scripts/generate-mock-data.py ]"
echo ""

echo -e "${BLUE}4. Mock 数据验证${NC}"
check_item "perfect_sample.xlsx" "[ -f assets/mock_data/perfect_sample.xlsx ]"
check_item "large_dataset.xlsx" "[ -f assets/mock_data/large_dataset.xlsx ]"
check_item "malformed_data.xlsx" "[ -f assets/mock_data/malformed_data.xlsx ]"
check_item "mixed_types.xlsx" "[ -f assets/mock_data/mixed_types.xlsx ]"
echo ""

echo -e "${BLUE}5. 文档验证${NC}"
check_item "E2E README.md" "[ -f e2e/README.md ]"
check_item "Mock 数据 README.md" "[ -f assets/mock_data/README.md ]"
check_item "实现总结.md" "[ -f IMPLEMENTATION-SUMMARY.md ]"
check_item "测试结果 README.md" "[ -f ../test-results/README.md ]"
echo ""

echo -e "${BLUE}6. 代码统计${NC}"
echo "测试文件数量:"
find e2e -name "*.spec.ts" | wc -l
echo "辅助文件数量:"
find e2e/helpers -name "*.ts" | wc -l
echo "总代码行数:"
find e2e -name "*.ts" -exec wc -l {} + | tail -1 | awk '{print $1}'
echo ""

echo -e "${BLUE}7. 文件大小${NC}"
echo "测试文件大小:"
du -h e2e/*.spec.ts
echo "Mock 数据大小:"
du -h assets/mock_data/*.xlsx
echo ""

# 总结
echo -e "${BLUE}======================================"
echo "验证结果"
echo "======================================${NC}"
echo -e "成功: ${GREEN}${SUCCESS_COUNT}${NC}"
echo -e "失败: ${RED}${FAIL_COUNT}${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ 所有验证通过！E2E 测试实现完成。${NC}"
    echo ""
    echo "下一步:"
    echo "  1. 安装依赖: npm install"
    echo "  2. 安装 Playwright: npm run test:e2e:install"
    echo "  3. 启动环境: docker-compose -f ../docker-compose.test.yml up -d"
    echo "  4. 运行测试: npm run test:e2e"
    echo ""
    exit 0
else
    echo -e "${RED}❌ 验证失败，请检查缺失的文件。${NC}"
    exit 1
fi
