#!/bin/bash

# Excel 导入 API 测试脚本
# 用于验证四个核心 API 端点的可用性

BASE_URL="http://localhost:8055"

echo "========================================="
echo "Excel 导入 API 测试"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_endpoint() {
  local name="$1"
  local method="$2"
  local url="$3"
  local data="$4"

  echo -e "${YELLOW}测试: ${name}${NC}"
  echo "方法: ${method}"
  echo "URL: ${url}"

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "${method}" \
      "${BASE_URL}${url}" \
      -H "Content-Type: application/json")
  else
    response=$(curl -s -w "\n%{http_code}" -X "${method}" \
      "${BASE_URL}${url}" \
      -H "Content-Type: application/json" \
      -d "${data}")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "${GREEN}✓ 状态码: ${http_code}${NC}"
    echo "响应: ${body}"
  else
    echo -e "${RED}✗ 状态码: ${http_code}${NC}"
    echo "响应: ${body}"
  fi

  echo ""
  echo "----------------------------------------"
  echo ""
}

# 1. 测试查询任务状态（GET）
test_endpoint \
  "查询任务状态" \
  "GET" \
  "/custom/excel/task/test-task-123"

# 2. 测试解析文件（POST）
test_endpoint \
  "解析 Excel 文件" \
  "POST" \
  "/custom/excel/parse" \
  '{"task_id": "test-task-123"}'

# 3. 测试创建集合（POST）
test_endpoint \
  "创建集合" \
  "POST" \
  "/custom/excel/create-collection" \
  '{
    "task_id": "test-task-123",
    "collection_name": "test_collection",
    "field_mappings": [
      {
        "field_name": "name",
        "display_name": "姓名",
        "type": "string",
        "nullable": false,
        "primary_key": false,
        "unique": false
      }
    ]
  }'

# 4. 测试上传文件（需要实际文件）
echo -e "${YELLOW}测试: 上传 Excel 文件${NC}"
echo "方法: POST"
echo "URL: /custom/excel/upload"
echo "说明: 需要实际文件，跳过测试"
echo ""
echo "----------------------------------------"
echo ""

echo "========================================="
echo "测试完成"
echo "========================================="
echo ""
echo "注意: 这些测试假设 Directus 已启动并运行在 ${BASE_URL}"
echo "如需测试文件上传，请准备一个 .xlsx 或 .xls 文件并运行:"
echo "curl -X POST ${BASE_URL}/custom/excel/upload -F 'file=@/path/to/file.xlsx'"
