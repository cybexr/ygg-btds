#!/bin/bash

# 路径验证测试脚本
# 测试 validate_safe_path 函数的安全性和边界条件

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试计数
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# 测试项目根目录
TEST_PROJECT_ROOT="/tmp/test-project-root"
TEST_DB_DIR="$TEST_PROJECT_ROOT/data"

# 设置测试环境
setup_test_env() {
    # 创建测试项目根目录
    mkdir -p "$TEST_PROJECT_ROOT"
    mkdir -p "$TEST_DB_DIR"
    # 创建深层嵌套路径用于测试
    mkdir -p "$TEST_PROJECT_ROOT/a/b/c/d/e"
}

# 清理测试环境
cleanup_test_env() {
    rm -rf "$TEST_PROJECT_ROOT"
}

# 加载被测试的函数
load_validate_function() {
    # 从 test-env.sh 提取 validate_safe_path 函数
    eval "$(sed -n '/^validate_safe_path()/,/^}/p' /home/hs/ygg/ygg-btds/tests/scripts/test-env.sh)"
}

# 测试函数
run_test() {
    local test_name="$1"
    local test_path="$2"
    local expected_result="$3"  # "pass" 或 "fail"
    local project_root="${4:-$TEST_PROJECT_ROOT}"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))

    # 临时修改 PROJECT_ROOT
    local original_project_root="${PROJECT_ROOT:-}"
    export PROJECT_ROOT="$project_root"

    if validate_safe_path "$test_path" "测试路径" 2>/dev/null; then
        actual_result="pass"
    else
        actual_result="fail"
    fi

    # 恢复原始 PROJECT_ROOT
    if [ -n "$original_project_root" ]; then
        export PROJECT_ROOT="$original_project_root"
    else
        unset PROJECT_ROOT
    fi

    if [ "$actual_result" = "$expected_result" ]; then
        echo -e "${GREEN}✓ PASS${NC}: $test_name"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}: $test_name"
        echo -e "  期望: $expected_result, 实际: $actual_result"
        echo -e "  路径: $test_path"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# 运行所有测试
run_all_tests() {
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}路径验证测试${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""

    setup_test_env
    load_validate_function

    echo -e "${BLUE}测试组 1: 有效路径${NC}"
    run_test "项目内的相对路径" "$TEST_DB_DIR" "pass"
    run_test "项目内的绝对路径" "/tmp/test-project-root/data" "pass"
    run_test "深层嵌套路径" "$TEST_PROJECT_ROOT/a/b/c/d/e" "pass"

    echo ""
    echo -e "${BLUE}测试组 2: 危险路径${NC}"
    run_test "根目录" "/" "fail"
    run_test "home 目录" "/home" "fail"
    run_test "用户 home" "~" "fail"
    run_test "系统路径" "/usr/bin" "fail"

    echo ""
    echo -e "${BLUE}测试组 3: 路径穿越攻击${NC}"
    run_test "包含.." "$TEST_PROJECT_ROOT/../etc" "fail"
    run_test "路径穿越 - ../" "$TEST_PROJECT_ROOT/../../tmp" "fail"
    run_test "URL 编码路径穿越" "$TEST_PROJECT_ROOT/%2e%2e/etc" "fail"
    run_test "大写 URL 编码" "$TEST_PROJECT_ROOT/%2E%2E/etc" "fail"

    echo ""
    echo -e "${BLUE}测试组 4: 边界条件${NC}"
    run_test "空字符串" "" "fail"
    run_test "仅空格" "   " "fail"
    run_test "不存在的路径" "/nonexistent/path/12345" "fail"

    echo ""
    echo -e "${BLUE}测试组 5: 特殊字符（由于路径不存在而失败）${NC}"
    run_test "包含引号的路径" "$TEST_PROJECT_ROOT/data'/test" "fail"
    run_test "包含分号的路径" "$TEST_PROJECT_ROOT/da;ta/test" "fail"
    run_test "包含管道符的路径" "$TEST_PROJECT_ROOT/da|ta/test" "fail"

    cleanup_test_env

    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}测试结果汇总${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo -e "总测试数: ${TESTS_TOTAL}"
    echo -e "${GREEN}通过: ${TESTS_PASSED}${NC}"
    echo -e "${RED}失败: ${TESTS_FAILED}${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ 所有测试通过！${NC}"
        return 0
    else
        echo -e "${RED}❌ 有 ${TESTS_FAILED} 个测试失败${NC}"
        return 1
    fi
}

# 主函数
main() {
    if run_all_tests; then
        exit 0
    else
        exit 1
    fi
}

# 如果直接运行此脚本
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
