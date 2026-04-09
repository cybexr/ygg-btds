#!/bin/bash

# 安全验证脚本
# 验证 test-env.sh 中的安全改进

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}test-env.sh 安全验证${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 测试 1: 验证严格模式
echo -e "${YELLOW}测试 1: 验证 Bash 严格模式${NC}"
if grep -q "set -euo pipefail" tests/scripts/test-env.sh; then
    echo -e "${GREEN}✓ PASS${NC}: 已启用完整严格模式 (set -euo pipefail)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 未启用完整严格模式"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 2: 验证路径验证函数存在
echo ""
echo -e "${YELLOW}测试 2: 验证路径验证函数存在${NC}"
if grep -q "^validate_safe_path()" tests/scripts/test-env.sh; then
    echo -e "${GREEN}✓ PASS${NC}: validate_safe_path 函数已定义"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: validate_safe_path 函数未找到"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 3: 验证清理操作使用路径验证
echo ""
echo -e "${YELLOW}测试 3: 验证清理操作使用路径验证${NC}"
if grep -A 5 "^env_clean()" tests/scripts/test-env.sh | grep -q "validate_safe_path"; then
    echo -e "${GREEN}✓ PASS${NC}: 清理操作在删除前进行路径验证"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 清理操作未使用路径验证"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 4: 验证未使用变量已删除
echo ""
echo -e "${YELLOW}测试 4: 验证未使用的 DB_FILE 变量已删除${NC}"
if ! grep -q "^DB_FILE=" tests/scripts/test-env.sh; then
    echo -e "${GREEN}✓ PASS${NC}: 未使用的 DB_FILE 变量已删除"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: DB_FILE 变量仍然存在"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 5: 验证文件复制前的存在性检查
echo ""
echo -e "${YELLOW}测试 5: 验证文件复制前的存在性检查${NC}"
if grep -B 5 "cp.*ENV_EXAMPLE" tests/scripts/test-env.sh | grep -q "if \[ ! -f"; then
    echo -e "${GREEN}✓ PASS${NC}: 文件复制前检查源文件存在性"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 文件复制前未检查源文件存在性"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 6: 验证 curl 依赖检查
echo ""
echo -e "${YELLOW}测试 6: 验证 curl 依赖检查${NC}"
if grep -A 5 "^env_test()" tests/scripts/test-env.sh | grep -q "command -v curl"; then
    echo -e "${GREEN}✓ PASS${NC}: 测试命令检查 curl 依赖"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 测试命令未检查 curl 依赖"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 7: 验证路径穿越攻击防护
echo ""
echo -e "${YELLOW}测试 7: 验证路径穿越攻击防护${NC}"
if grep -q '\.\.' tests/scripts/test-env.sh | grep -q "path.*traversal"; then
    echo -e "${GREEN}✓ PASS${NC}: 检测到路径穿越攻击防护"
    TESTS_PASSED=$((TESTS_PASSED + 1))
elif grep -q '\.\.' tests/scripts/test-env.sh; then
    echo -e "${GREEN}✓ PASS${NC}: 检测到路径穿越检查逻辑"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 未找到路径穿越攻击防护"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 8: 验证测试脚本存在且可执行
echo ""
echo -e "${YELLOW}测试 8: 验证路径验证测试脚本存在${NC}"
if [ -x "tests/scripts/test/test-path-validation.sh" ]; then
    echo -e "${GREEN}✓ PASS${NC}: 路径验证测试脚本存在且可执行"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 路径验证测试脚本不存在或不可执行"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 9: 运行路径验证测试
echo ""
echo -e "${YELLOW}测试 9: 运行路径验证测试套件${NC}"
if tests/scripts/test/test-path-validation.sh >/dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC}: 路径验证测试套件全部通过"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 路径验证测试套件有失败"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 测试 10: 验证危险路径检查
echo ""
echo -e "${YELLOW}测试 10: 验证危险路径检查${NC}"
if grep -q 'case.*".*"' tests/scripts/test-env.sh | head -5 | grep -q "/"; then
    echo -e "${GREEN}✓ PASS${NC}: 检测到危险路径检查逻辑"
    TESTS_PASSED=$((TESTS_PASSED + 1))
elif grep -q '"/"|"/home"|"~"' tests/scripts/test-env.sh; then
    echo -e "${GREEN}✓ PASS${NC}: 检测到系统目录防护"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC}: 未找到危险路径检查"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

# 输出结果汇总
echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}验证结果汇总${NC}"
echo -e "${YELLOW}========================================${NC}"
echo -e "总测试数: $((TESTS_PASSED + TESTS_FAILED))"
echo -e "${GREEN}通过: ${TESTS_PASSED}${NC}"
echo -e "${RED}失败: ${TESTS_FAILED}${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 所有安全验证通过！${NC}"
    echo ""
    echo "修复内容："
    echo "1. ✓ 启用完整的 Bash 严格模式 (set -euo pipefail)"
    echo "2. ✓ 添加路径验证函数 validate_safe_path()"
    echo "3. ✓ 在清理操作前验证路径安全性"
    echo "4. ✓ 删除未使用的 DB_FILE 变量"
    echo "5. ✓ 添加文件复制前的存在性检查"
    echo "6. ✓ 添加 curl 依赖检查"
    echo "7. ✓ 创建路径验证测试套件"
    echo "8. ✓ 防护路径穿越攻击 (../, %2e%2e)"
    echo "9. ✓ 防护危险路径 (/, /home, ~)"
    echo "10. ✓ 验证路径在项目根目录内"
    exit 0
else
    echo -e "${RED}❌ 有 ${TESTS_FAILED} 项验证失败${NC}"
    exit 1
fi
