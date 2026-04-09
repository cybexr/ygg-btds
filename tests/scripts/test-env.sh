#!/bin/bash

# E2E 测试环境管理脚本
# 用于快速启动、停止和管理测试环境（SQLite 版本）

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 配置
DB_DIR="$PROJECT_ROOT/data"
DB_FILE="$DB_DIR/btdms_test.db"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}BTDMS E2E 测试环境管理 (SQLite)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 帮助信息
show_help() {
    echo "用法: ./test-env.sh [命令]"
    echo ""
    echo "命令:"
    echo "  setup     创建数据目录和 SQLite 数据库"
    echo "  verify    验证环境配置"
    echo "  clean     清理环境（删除数据库文件）"
    echo "  test      运行 E2E 测试"
    echo "  help      显示此帮助信息"
    echo ""
}

# 设置环境
env_setup() {
    echo -e "${GREEN}🚀 设置测试环境...${NC}"

    # 创建数据目录
    mkdir -p "$DB_DIR"
    echo -e "${GREEN}✅${NC} 数据目录已创建: $DB_DIR"

    # 创建 .env.test.local（如果不存在）
    ENV_FILE="$PROJECT_ROOT/tests/.env.test.local"
    if [ ! -f "$ENV_FILE" ]; then
        cp "$PROJECT_ROOT/tests/.env.example" "$ENV_FILE"
        echo -e "${GREEN}✅${NC} 测试环境配置已创建: $ENV_FILE"
    else
        echo -e "${YELLOW}ℹ️${NC} 测试环境配置已存在: $ENV_FILE"
    fi

    echo -e "${GREEN}✅ 测试环境设置完成${NC}"
    echo -e "${YELLOW}⏳ 请启动 Directus: npm run dev${NC}"
}

# 验证环境
env_verify() {
    echo -e "${BLUE}🔍 验证测试环境...${NC}"
    bash "$SCRIPT_DIR/verify-test-env.sh"
}

# 清理环境
env_clean() {
    echo -e "${RED}⚠️  警告: 这将删除所有测试数据${NC}"
    read -p "确定要清理吗? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🧹 清理测试环境...${NC}"
        rm -rf "$DB_DIR"
        echo -e "${GREEN}✅ 测试环境已清理${NC}"
    else
        echo -e "${YELLOW}❌ 已取消${NC}"
    fi
}

# 运行测试
env_test() {
    echo -e "${BLUE}🧪 运行 E2E 测试...${NC}"

    # 检查环境
    BASE_URL="${TEST_BASE_URL:-http://localhost:8055}"
    if ! curl -f -s "${BASE_URL}/health" > /dev/null 2>&1; then
        echo -e "${RED}❌ 测试环境未就绪${NC}"
        echo "请先运行: npm run dev"
        exit 1
    fi

    # 运行测试
    cd "$PROJECT_ROOT/tests"
    npx playwright test "$@"
}

# 主逻辑
case "${1:-help}" in
    setup)
        env_setup
        ;;
    verify)
        env_verify
        ;;
    clean)
        env_clean
        ;;
    test)
        shift
        env_test "$@"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}❌ 未知命令: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
