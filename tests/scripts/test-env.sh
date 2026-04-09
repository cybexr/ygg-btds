#!/bin/bash

# E2E 测试环境管理脚本
# 用于快速启动、停止和管理测试环境（SQLite 版本）

set -euo pipefail

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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}BTDMS E2E 测试环境管理 (SQLite)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 路径验证函数
validate_safe_path() {
    local path="$1"
    local path_name="${2:-路径}"

    # 检查路径是否为空
    if [ -z "$path" ]; then
        echo -e "${RED}❌ 错误: ${path_name}为空${NC}" >&2
        return 1
    fi

    # 检查路径是否为根目录或危险路径
    case "$path" in
        "/"|"/home"|"~"|"/home/*")
            echo -e "${RED}❌ 错误: ${path_name}指向系统目录: $path${NC}" >&2
            return 1
            ;;
    esac

    # 检查路径是否包含路径穿越攻击
    if [[ "$path" == *".."* ]] || [[ "$path" == *"%2e"* ]] || [[ "$path" == *"%2E"* ]]; then
        echo -e "${RED}❌ 错误: ${path_name}包含路径穿越字符: $path${NC}" >&2
        return 1
    fi

    # 检查路径是否在项目根目录内
    local resolved_path
    resolved_path="$(cd "$path" 2>/dev/null && pwd)" || {
        echo -e "${RED}❌ 错误: ${path_name}无法解析: $path${NC}" >&2
        return 1
    }

    if [[ "$resolved_path" != "$PROJECT_ROOT"* ]]; then
        echo -e "${RED}❌ 错误: ${path_name}不在项目根目录内: $resolved_path${NC}" >&2
        return 1
    fi

    return 0
}

# 检测是否在 CI 环境
is_ci_environment() {
    # 检查常见的 CI 环境变量
    if [[ -n "${CI:-}" ]] || \
       [[ -n "${CONTINUOUS_INTEGRATION:-}" ]] || \
       [[ -n "${GITHUB_ACTIONS:-}" ]] || \
       [[ -n "${GITLAB_CI:-}" ]] || \
       [[ -n "${JENKINS_URL:-}" ]] || \
       [[ -n "${TRAVIS:-}" ]] || \
       [[ -n "${CIRCLECI:-}" ]]; then
        return 0
    fi

    # 检查是否在 TTY 中（非交互式环境）
    if [[ ! -t 0 ]]; then
        return 0
    fi

    return 1
}

# 帮助信息
show_help() {
    echo "用法: ./test-env.sh [命令] [参数]"
    echo ""
    echo "命令:"
    echo "  setup     创建数据目录和 SQLite 数据库"
    echo "  verify    验证环境配置"
    echo "  clean     清理环境（删除数据库文件）"
    echo "              选项: --force, -f  跳过确认直接清理"
    echo "  test      运行 E2E 测试"
    echo "  help      显示此帮助信息"
    echo ""
    echo "环境变量:"
    echo "  CI        设置为任意值以跳过交互式确认（用于 CI/CD）"
    echo ""
    echo "自动检测:"
    echo "  脚本会自动检测 CI 环境（GITHUB_ACTIONS, GITLAB_CI 等）"
    echo "  和非 TTY 环境，在这些环境下会自动跳过确认提示"
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
    ENV_EXAMPLE="$PROJECT_ROOT/tests/.env.example"
    if [ ! -f "$ENV_FILE" ]; then
        if [ ! -f "$ENV_EXAMPLE" ]; then
            echo -e "${RED}❌ 错误: 配置模板文件不存在: $ENV_EXAMPLE${NC}"
            exit 1
        fi
        cp "$ENV_EXAMPLE" "$ENV_FILE"
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
    local force_flag=false

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force|-f)
                force_flag=true
                shift
                ;;
            *)
                echo -e "${RED}❌ 未知参数: $1${NC}" >&2
                echo "用法: ./test-env.sh clean [--force|-f]"
                exit 1
                ;;
        esac
    done

    # 验证 DB_DIR 路径安全性（始终执行，即使使用 --force）
    if ! validate_safe_path "$DB_DIR" "数据目录"; then
        exit 1
    fi

    # 检查是否在 CI 环境中或使用了 --force 参数
    local skip_confirmation=false
    if [[ "$force_flag" == true ]]; then
        skip_confirmation=true
        echo -e "${YELLOW}ℹ️ 使用 --force 参数跳过确认${NC}"
    elif is_ci_environment; then
        skip_confirmation=true
        echo -e "${YELLOW}ℹ️ 检测到 CI 环境，自动跳过确认${NC}"
    fi

    # 确认清理（除非在 CI 环境或使用了 --force）
    if [[ "$skip_confirmation" == false ]]; then
        echo -e "${RED}⚠️  警告: 这将删除所有测试数据${NC}"
        read -p "确定要清理吗? (y/N): " -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}❌ 已取消${NC}"
            exit 0
        fi
    fi

    # 执行清理
    echo -e "${YELLOW}🧹 清理测试环境...${NC}"
    rm -rf "$DB_DIR"
    echo -e "${GREEN}✅ 测试环境已清理${NC}"
}

# 运行测试
env_test() {
    echo -e "${BLUE}🧪 运行 E2E 测试...${NC}"

    # 检查依赖
    if ! command -v curl >/dev/null 2>&1; then
        echo -e "${RED}❌ 错误: 需要安装 curl 命令${NC}" >&2
        exit 1
    fi

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
        shift
        env_clean "$@"
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
