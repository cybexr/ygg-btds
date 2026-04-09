#!/usr/bin/env python3
"""
生成 E2E 测试所需的 Mock Excel 数据文件
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import os

# 输出目录
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '../assets/mock_data')
os.makedirs(OUTPUT_DIR, exist_ok=True)

def generate_perfect_sample():
    """生成完美规范的测试数据"""
    print("📄 生成 perfect_sample.xlsx...")

    df = pd.DataFrame({
        '姓名': [f'测试用户{i}' for i in range(1, 101)],
        '邮箱': [f'user{i}@test.example.com' for i in range(1, 101)],
        '年龄': np.random.randint(18, 65, 100),
        '分数': np.round(np.random.rand(100) * 100, 2),
        '是否激活': np.random.choice([True, False], 100),
        '部门': np.random.choice(['技术部', '市场部', '人事部', '财务部'], 100),
        '入职日期': pd.date_range('2023-01-01', periods=100, freq='D'),
        '备注': [f'备注信息{i}' for i in range(1, 101)]
    })

    output_path = os.path.join(OUTPUT_DIR, 'perfect_sample.xlsx')
    df.to_excel(output_path, index=False, engine='openpyxl')
    print(f"✅ 已生成: {output_path}")

def generate_large_dataset():
    """生成大批量测试数据"""
    print("📄 生成 large_dataset.xlsx...")

    df = pd.DataFrame({
        'ID': range(1, 10001),
        '产品名称': [f'产品{i}' for i in range(1, 10001)],
        '类别': np.random.choice(['电子产品', '家居用品', '食品', '服装'], 10000),
        '价格': np.round(np.random.rand(10000) * 1000 + 10, 2),
        '库存': np.random.randint(0, 500, 10000),
        '上架时间': pd.date_range('2023-01-01', periods=10000, freq='min'),
        '是否热销': np.random.choice([True, False], 10000),
        '供应商': [f'供应商{i%100}' for i in range(1, 10001)],
        '描述': [f'产品{i}的详细描述' for i in range(1, 10001)]
    })

    output_path = os.path.join(OUTPUT_DIR, 'large_dataset.xlsx')
    df.to_excel(output_path, index=False, engine='openpyxl')
    print(f"✅ 已生成: {output_path}")

def generate_malformed_data():
    """生成包含异常格式的测试数据"""
    print("📄 生成 malformed_data.xlsx...")

    data = {
        '姓名': ['正常用户', None, '', '用户4', '用户5', '用户6', '用户7', '用户8'],
        '邮箱': ['valid@example.com', 'invalid-email', 'no-at-sign.com', 'user4@test.com', None, 'user6@test.com', '', 'user8@test.com'],
        '年龄': [25, '不是数字', 150, -5, None, 30, '未知', 40],
        '分数': [85.5, 101, -10, None, '分数', 75.5, 90, 88],
        '激活状态': [True, False, None, 'yes', 'no', True, False, ''],
    }

    df = pd.DataFrame(data)

    output_path = os.path.join(OUTPUT_DIR, 'malformed_data.xlsx')
    df.to_excel(output_path, index=False, engine='openpyxl')
    print(f"✅ 已生成: {output_path}")

def generate_mixed_types():
    """生成包含多种字段类型的测试数据"""
    print("📄 生成 mixed_types.xlsx...")

    df = pd.DataFrame({
        '文本字段': [f'文本{i}' for i in range(1, 51)],
        '长文本': ['这是一段较长的文本内容，用于测试文本字段的处理能力。' * 3 for _ in range(50)],
        '整数': np.random.randint(-1000, 1000, 50),
        '小数': np.round(np.random.rand(50) * 100, 4),
        '货币': [f'￥{np.random.rand() * 1000:.2f}' for _ in range(50)],
        '日期': pd.date_range('2023-01-01', periods=50, freq='D'),
        '时间': pd.date_range('2023-01-01', periods=50, freq='h').time,
        '布尔值': np.random.choice([True, False], 50),
        '百分比': [f'{np.random.randint(0, 100)}%' for _ in range(50)],
        'URL': [f'https://example.com/page{i}' for i in range(1, 51)],
        '邮箱': [f'user{i}@test.com' for i in range(1, 51)],
        '电话': [f'138{str(i).zfill(8)}' for i in range(50)],
        'JSON数据': [f'{{"id": {i}, "name": "item{i}"}}' for i in range(1, 51)]
    })

    output_path = os.path.join(OUTPUT_DIR, 'mixed_types.xlsx')
    df.to_excel(output_path, index=False, engine='openpyxl')
    print(f"✅ 已生成: {output_path}")

def main():
    print("=" * 50)
    print("生成 E2E 测试 Mock 数据")
    print("=" * 50)
    print()

    try:
        generate_perfect_sample()
        generate_large_dataset()
        generate_malformed_data()
        generate_mixed_types()

        print()
        print("=" * 50)
        print("✅ 所有 Mock 数据生成完成！")
        print(f"📁 输出目录: {OUTPUT_DIR}")
        print("=" * 50)

    except ImportError as e:
        print("❌ 缺少必要的 Python 库")
        print("请运行: pip install pandas openpyxl numpy")
        return 1
    except Exception as e:
        print(f"❌ 生成数据时出错: {e}")
        return 1

    return 0

if __name__ == '__main__':
    exit(main())
