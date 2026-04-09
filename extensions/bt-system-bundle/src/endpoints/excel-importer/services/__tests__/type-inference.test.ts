/**
 * 类型推断服务单元测试
 */

import { describe, it, expect } from 'vitest';
import {
	inferFieldType,
	createFieldMappings,
	adjustFieldMapping,
	adjustFieldMappings,
	FieldType,
} from '../type-inference';

describe('类型推断服务', () => {
	describe('inferFieldType', () => {
		it('应该正确推断布尔类型', () => {
			const values = ['true', 'false', 'yes', 'no', '是', '否', '1', '0'];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.BOOLEAN);
			expect(result.confidence).toBeGreaterThan(0.8);
			expect(result.nullable).toBe(false);
		});

		it('应该正确推断整数类型', () => {
			const values = ['1', '100', '999', '-42', '0'];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.confidence).toBe(1);
			expect(result.nullable).toBe(false);
		});

		it('应该正确推断小数类型', () => {
			const values = ['1.5', '3.14', '0.001', '-10.5'];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.DECIMAL);
			expect(result.confidence).toBe(1);
			expect(result.nullable).toBe(false);
		});

		it('应该正确推断时间戳类型', () => {
			const values = [
				'2024-01-01 12:00:00',
				'2024-12-31T23:59:59Z',
				'2024-06-15 08:30:00',
			];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.DATETIME);
			expect(result.confidence).toBeGreaterThan(0.8);
		});

		it('应该正确推断日期类型', () => {
			const values = ['2024-01-01', '2024-12-31', '2024-06-15'];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.DATE);
			expect(result.confidence).toBe(1);
		});

		it('应该正确推断时间类型', () => {
			const values = ['12:00:00', '23:59:59', '08:30:00'];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.TIME);
			expect(result.confidence).toBe(1);
		});

		it('应该正确推断 UUID 类型', () => {
			const values = [
				'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
				'f47ac10b-58cc-4372-a567-0e02b2c3d479',
			];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.UUID);
			expect(result.confidence).toBe(1);
		});

		it('应该正确推断 JSON 类型', () => {
			const values = [
				'{"name":"test","value":123}',
				'{"id":1,"active":true}',
				'[]',
			];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.JSON);
			expect(result.confidence).toBeGreaterThan(0.6);
		});

		it('应该处理空值', () => {
			const values = ['test', '', null, undefined, 'value'];
			const result = inferFieldType(values);

			expect(result.nullable).toBe(true);
			expect(result.confidence).toBeGreaterThan(0);
		});

		it('应该处理完全为空的数组', () => {
			const values: any[] = [];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0);
			expect(result.sample_count).toBe(0);
		});

		it('应该处理只有空值的数组', () => {
			const values = [null, undefined, '', ''];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0);
			expect(result.nullable).toBe(true);
		});

		it('应该处理混合数据并选择最合适的类型', () => {
			const values = ['123', '456', '789', 'text'];
			const result = inferFieldType(values, { confidence_threshold: 0.8 });

			// 由于有文本混合，置信度可能不高
			expect(result.type).toBe(FieldType.STRING);
			expect(result.nullable).toBe(false);
		});

		it('应该限制样本数量', () => {
			const values = Array.from({ length: 1000 }, (_, i) => i.toString());
			const result = inferFieldType(values, { max_sample_size: 100 });

			expect(result.sample_count).toBeLessThanOrEqual(100);
			expect(result.type).toBe(FieldType.INTEGER);
		});

		it('应该正确识别中文布尔值', () => {
			const values = ['是', '否', '是', '是'];
			const result = inferFieldType(values);

			expect(result.type).toBe(FieldType.BOOLEAN);
			expect(result.confidence).toBe(1);
		});
	});

	describe('createFieldMappings', () => {
		it('应该基于表头和数据创建字段映射', () => {
			const headers = ['姓名', '年龄', '分数'];
			const data = [
				{ 姓名: '张三', 年龄: '25', 分数: '95.5' },
				{ 姓名: '李四', 年龄: '30', 分数: '87.0' },
			];

			const mappings = createFieldMappings(headers, data);

			expect(mappings).toHaveLength(3);
			expect(mappings[0].display_name).toBe('姓名');
			expect(mappings[0].type).toBe(FieldType.STRING);
			expect(mappings[1].type).toBe(FieldType.INTEGER);
			expect(mappings[2].type).toBe(FieldType.DECIMAL);
		});

		it('应该标记第一列为主键', () => {
			const headers = ['ID', '姓名', '年龄'];
			const data = [{ ID: '1', 姓名: '张三', 年龄: '25' }];

			const mappings = createFieldMappings(headers, data);

			expect(mappings[0].primary_key).toBe(true);
			expect(mappings[0].unique).toBe(true);
			expect(mappings[1].primary_key).toBe(false);
		});

		it('应该正确处理空值', () => {
			const headers = ['字段1', '字段2'];
			const data = [
				{ 字段1: 'value1', 字段2: '' },
				{ 字段1: 'value2', 字段2: null },
			];

			const mappings = createFieldMappings(headers, data);

			expect(mappings[1].nullable).toBe(true);
		});

		it('应该为字符串类型设置最大长度', () => {
			const headers = ['描述'];
			const data = [{ 描述: '这是一个测试文本' }];

			const mappings = createFieldMappings(headers, data);

			expect(mappings[0].max_length).toBe(255);
		});

		it('应该生成英文字段名', () => {
			const headers = ['姓名', '年龄'];
			const data = [{ 姓名: '张三', 年龄: '25' }];

			const mappings = createFieldMappings(headers, data);

			expect(mappings[0].field_name).toBeDefined();
			expect(typeof mappings[0].field_name).toBe('string');
		});

		it('应该处理特殊字符', () => {
			const headers = ['姓名-测试', '年龄（岁）'];
			const data = [{ '姓名-测试': '张三', '年龄（岁）': '25' }];

			const mappings = createFieldMappings(headers, data);

			expect(mappings[0].field_name).not.toContain('-');
			expect(mappings[0].field_name).not.toContain('（');
		});

		it('应该处理重复字段名', () => {
			const headers = ['field', 'field'];
			const data = [{ field: 'value1' }, {}];

			const mappings = createFieldMappings(headers, data);

			// 字段名应该唯一（即使显示名称相同）
			expect(mappings[0].field_name).toBeDefined();
			expect(mappings[1].field_name).toBeDefined();
		});
	});

	describe('adjustFieldMapping', () => {
		it('应该调整单个字段映射', () => {
			const mapping = {
				field_name: 'test_field',
				display_name: '测试字段',
				type: FieldType.STRING,
				nullable: true,
				primary_key: false,
				unique: false,
			};

			const adjusted = adjustFieldMapping(mapping, {
				nullable: false,
				unique: true,
			});

			expect(adjusted.nullable).toBe(false);
			expect(adjusted.unique).toBe(true);
			expect(adjusted.field_name).toBe('test_field');
		});

		it('应该支持类型修改', () => {
			const mapping = {
				field_name: 'age',
				display_name: '年龄',
				type: FieldType.STRING,
				nullable: false,
				primary_key: false,
				unique: false,
			};

			const adjusted = adjustFieldMapping(mapping, {
				type: FieldType.INTEGER,
			});

			expect(adjusted.type).toBe(FieldType.INTEGER);
		});
	});

	describe('adjustFieldMappings', () => {
		it('应该批量调整字段映射', () => {
			const mappings = [
				{
					field_name: 'field1',
					display_name: '字段1',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
				{
					field_name: 'field2',
					display_name: '字段2',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			const adjustments = [
				{ nullable: false },
				{ type: FieldType.INTEGER },
			];

			const adjusted = adjustFieldMappings(mappings, adjustments);

			expect(adjusted[0].nullable).toBe(false);
			expect(adjusted[1].type).toBe(FieldType.INTEGER);
		});

		it('应该处理部分调整', () => {
			const mappings = [
				{
					field_name: 'field1',
					display_name: '字段1',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
				{
					field_name: 'field2',
					display_name: '字段2',
					type: FieldType.STRING,
					nullable: true,
					primary_key: false,
					unique: false,
				},
			];

			const adjustments = [
				{ nullable: false },
			];

			const adjusted = adjustFieldMappings(mappings, adjustments);

			expect(adjusted[0].nullable).toBe(false);
			expect(adjusted[1].nullable).toBe(true); // 未调整的保持原值
		});
	});
});
