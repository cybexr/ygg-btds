#!/bin/bash
# E2E 测试快速运行脚本
# 用于快速启动和运行 E2E 测试

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_DIR="$PROJECT_ROOT/tests"

echo -e "${BLUE}======================================"
echo "BTDMS E2E 测试运行器"
echo "======================================${NC}"
echo ""

# 检查参数
TEST_TYPE="${1:-all}"
HEADLESS="${2:-true}"

# 进入测试目录
cd "$TEST_DIR"

# 函数：显示帮助
show_help() {
    echo "用法: $0 [测试类型] [是否无头模式]"
    echo ""
    echo "测试类型:"
    echo "  all           - 运行所有测试 (默认)"
    echo "  import        - 运行导入流程测试"
    echo "  permission    - 运行权限流程测试"
    echo "  environment   - 运行环境检查测试"
    echo ""
    echo "无头模式:"
    echo "  true          - 无头模式 (默认)"
    echo "  false         - 显示浏览器窗口"
    echo ""
    echo "示例:"
    echo "  $0 all true        # 运行所有测试（无头）"
    echo "  $0 import false    # 运行导入测试（显示浏览器）"
    echo ""
}

# 函数：检查环境
check_environment() {
    echo -e "${BLUE}1. 检查测试环境...${NC}"

    # 检查 Node.js 依赖
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}⚠️  Node.js 依赖未安装，正在安装...${NC}"
        npm install
    fi

    # 检查 Playwright
    if ! npx playwright --version &> /dev/null; then
        echo -e "${YELLOW}⚠️  Playwright 未安装，正在安装...${NC}"
        npm run test:e2e:install
    fi

    # 检查 Mock 数据
    if [ ! -f "assets/mock_data/perfect_sample.xlsx" ]; then
        echo -e "${YELLOW}⚠️  Mock 数据未生成，正在生成...${NC}"
        npm run generate-mock-data
    fi

    echo -e "${GREEN}✅ 环境检查完成${NC}"
    echo ""
}

# 函数：启动 Docker 环境
start_docker() {
    echo -e "${BLUE}2. 启动 Docker 测试环境...${NC}"

    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker 未运行${NC}"
        exit 1
    fi

    # 启动测试环境
    cd "$PROJECT_ROOT"
    docker-compose -f docker-compose.test.yml up -d

    # 等待服务就绪
    echo -e "${YELLOW}⏳ 等待服务就绪...${NC}"
    sleep 10

    # 检查健康状态
    MAX_RETRIES=30
    for i in $(seq 1 $MAX_RETRIES); do
        if curl -f -s "http://localhost:8080/health" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ 测试环境就绪${NC}"
            break
        fi
        if [ $i -eq $MAX_RETRIES ]; then
            echo -e "${RED}❌ 测试环境启动失败${NC}"
            exit 1
        fi
        sleep 2
    done

    cd "$TEST_DIR"
    echo ""
}

# 函数：运行测试
run_tests() {
    echo -e "${BLUE}3. 运行 E2E 测试...${NC}"
    echo ""

    local test_file=""
    local test_name=""

    case $TEST_TYPE in
        "import")
            test_file="import-flow.spec.ts"
            test_name="导入流程测试"
            ;;
        "permission")
            test_file="permission-flow.spec.ts"
            test_name="权限流程测试"
            ;;
        "environment")
            test_file="environment-check.spec.ts"
            test_name="环境检查测试"
            ;;
        "all")
            test_name="所有 E2E 测试"
            ;;
        *)
            echo -e "${RED}❌ 未知的测试类型: $TEST_TYPE${NC}"
            show_help
            exit 1
            ;;
    esac

    # 构建测试命令
    if [ "$HEADLESS" = "false" ]; then
        echo -e "${YELLOW}🖥️  以 headed 模式运行测试...${NC}"
        HEADLESS_FLAG="--headed"
    else
        echo -e "${YELLOW}🔇 以无头模式运行测试...${NC}"
        HEADLESS_FLAG=""
    fi

    # 运行测试
    if [ -n "$test_file" ]; then
        echo -e "${BLUE}运行: $test_name${NC}"
        npx playwright test "$test_file" $HEADLESS_FLAG
    else
        echo -e "${BLUE}运行: 所有测试${NC}"
        npx playwright test $HEADLESS_FLAG
    fi

    echo ""
}

# 函数：显示结果
show_results() {
    echo -e "${BLUE}======================================"
    echo "测试完成"
    echo "======================================${NC}"
    echo ""
    echo "📊 查看测试报告:"
    echo "  HTML: npm run test:e2e:report"
    echo "  或: npx playwright show-report"
    echo ""
    echo "🧹 清理测试环境:"
    echo "  停止 Docker: cd .. && docker-compose -f docker-compose.test.yml down"
    echo ""
}

# 主流程
main() {
    # 显示帮助
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi

    # 检查环境
    check_environment

    # 启动 Docker
    start_docker

    # 运行测试
    run_tests

    # 显示结果
    show_results
}

# 运行主流程
main
