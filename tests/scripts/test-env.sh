#!/bin/bash

# E2E 测试环境管理脚本
# 用于快速启动、停止和管理测试环境

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
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.test.yml"
COMPOSE_PROJECT_NAME="btdms-test"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}BTDMS E2E 测试环境管理${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 帮助信息
show_help() {
    echo "用法: ./test-env.sh [命令]"
    echo ""
    echo "命令:"
    echo "  up        启动测试环境"
    echo "  down      停止测试环境"
    echo "  restart   重启测试环境"
    echo "  status    查看环境状态"
    echo "  logs      查看服务日志"
    echo "  verify    验证环境配置"
    echo "  clean     清理环境（删除数据卷）"
    echo "  init      初始化测试数据库"
    echo "  test      运行 E2E 测试"
    echo "  help      显示此帮助信息"
    echo ""
}

# 启动环境
env_up() {
    echo -e "${GREEN}🚀 启动测试环境...${NC}"
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" up -d
    echo -e "${GREEN}✅ 测试环境已启动${NC}"
    echo -e "${YELLOW}⏳ 等待服务就绪（约 30 秒）...${NC}"
    sleep 30
    echo -e "${GREEN}✅ 服务应该已就绪${NC}"
}

# 停止环境
env_down() {
    echo -e "${YELLOW}🛑 停止测试环境...${NC}"
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" down
    echo -e "${GREEN}✅ 测试环境已停止${NC}"
}

# 重启环境
env_restart() {
    echo -e "${YELLOW}🔄 重启测试环境...${NC}"
    env_down
    sleep 2
    env_up
}

# 查看状态
env_status() {
    echo -e "${BLUE}📊 测试环境状态:${ ${NC}"
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" ps
    echo ""

    # 检查 Directus 健康状态
    BASE_URL="${TEST_BASE_URL:-http://localhost:8080}"
    if curl -f -s "${BASE_URL}/health" > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} Directus: 健康"
    else
        echo -e "${RED}❌${NC} Directus: 不可访问"
    fi

    # 检查数据库
    if docker exec btdms-test-db pg_isready -U directus > /dev/null 2>&1; then
        echo -e "${GREEN}✅${NC} PostgreSQL: 健康"
    else
        echo -e "${RED}❌${NC} PostgreSQL: 不可访问"
    fi
}

# 查看日志
env_logs() {
    docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" logs -f
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
        docker-compose -f "$COMPOSE_FILE" -p "$COMPOSE_PROJECT_NAME" down -v
        echo -e "${GREEN}✅ 测试环境已清理${NC}"
    else
        echo -e "${YELLOW}❌ 已取消${NC}"
    fi
}

# 初始化数据库
env_init() {
    echo -e "${BLUE}🗄️  初始化测试数据库...${NC}"

    # 检查容器是否运行
    if ! docker ps --format '{{.Names}}' | grep -q "^btdms-test-db$"; then
        echo -e "${RED}❌ 数据库容器未运行${NC}"
        echo "请先运行: $0 up"
        exit 1
    fi

    # 执行初始化脚本
    docker exec -i btdms-test-db psql -U directus -d btdms_test < "$SCRIPT_DIR/init-test-db.sql"

    echo -e "${GREEN}✅ 数据库初始化完成${NC}"
}

# 运行测试
env_test() {
    echo -e "${BLUE}🧪 运行 E2E 测试...${NC}"

    # 检查环境
    if ! curl -f -s "${TEST_BASE_URL:-http://localhost:8080}/health" > /dev/null 2>&1; then
        echo -e "${RED}❌ 测试环境未就绪${NC}"
        echo "请先运行: $0 up && $0 verify"
        exit 1
    fi

    # 运行测试
    cd "$PROJECT_ROOT/tests"
    npx playwright test "$@"
}

# 主逻辑
case "${1:-help}" in
    up)
        env_up
        ;;
    down)
        env_down
        ;;
    restart)
        env_restart
        ;;
    status)
        env_status
        ;;
    logs)
        env_logs
        ;;
    verify)
        env_verify
        ;;
    clean)
        env_clean
        ;;
    init)
        env_init
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
