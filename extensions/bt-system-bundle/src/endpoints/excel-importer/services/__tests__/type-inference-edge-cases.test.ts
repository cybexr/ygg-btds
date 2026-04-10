/**
 * 类型推断服务边界条件测试
 */

import { describe, expect, it } from 'vitest';
import { inferFieldType } from '../type-inference';
import { FieldType } from '../../types';

describe('类型推断服务边界条件', () => {
	describe('空值与混合类型', () => {
		it('全空值列应回退为字符串并标记 nullable', () => {
			const result = inferFieldType([null, undefined, '', '']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0);
			expect(result.sample_count).toBe(0);
			expect(result.nullable).toBe(true);
			expect(result.sample_values).toEqual([]);
		});

		it('全为 undefined 的列应回退为字符串', () => {
			const result = inferFieldType([undefined, undefined, undefined]);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.sample_count).toBe(0);
			expect(result.nullable).toBe(true);
		});

		it('部分空值的整数列应保持 integer 并标记 nullable', () => {
			const result = inferFieldType(['1', '2', null, '4']);

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.confidence).toBe(1);
			expect(result.sample_count).toBe(3);
			expect(result.nullable).toBe(true);
			expect(result.sample_values).toEqual(['1', '2', '4']);
		});

		it('部分空值的布尔列应保持 boolean 并标记 nullable', () => {
			const result = inferFieldType(['yes', '', 'no', null, 'true']);

			expect(result.type).toBe(FieldType.BOOLEAN);
			expect(result.confidence).toBe(1);
			expect(result.sample_count).toBe(3);
			expect(result.nullable).toBe(true);
		});

		it('字符串与数字混合列在默认阈值下应回退为字符串', () => {
			const result = inferFieldType(['alpha', 1, 'beta']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBeLessThan(0.7);
			expect(result.nullable).toBe(false);
		});

		it('日期与普通字符串混合列应回退为字符串', () => {
			const result = inferFieldType(['2024-01-01', 'not-a-date', '2024-01-03']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBeCloseTo(2 / 3, 5);
		});

		it('JSON 与普通字符串混合列应回退为字符串', () => {
			const result = inferFieldType(['{"a":1}', 'plain-text', '{"b":2}']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBeCloseTo(2 / 3, 5);
		});

		it('样本值只应保留前五个有效值', () => {
			const result = inferFieldType(['1', '2', '3', '4', '5', '6']);

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.sample_values).toEqual(['1', '2', '3', '4', '5']);
		});
	});

	describe('数值边界与精度', () => {
		it('安全整数上限仍应识别为 integer', () => {
			const result = inferFieldType([String(Number.MAX_SAFE_INTEGER), '42']);

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.confidence).toBe(1);
		});

		it('超过安全整数范围的纯数字字符串应退化为 float', () => {
			const result = inferFieldType(['9007199254740992', '9007199254740993']);

			expect(result.type).toBe(FieldType.FLOAT);
			expect(result.confidence).toBe(1);
		});

		it('高精度小数应识别为 decimal', () => {
			const result = inferFieldType(['3.141592653589793', '2.718281828459045']);

			expect(result.type).toBe(FieldType.DECIMAL);
			expect(result.confidence).toBe(1);
		});

		it('整数与小数混合列应识别为 decimal', () => {
			const result = inferFieldType(['1', '2.5', '-3']);

			expect(result.type).toBe(FieldType.DECIMAL);
			expect(result.confidence).toBe(1);
		});

		it('科学计数法在当前实现下应回退为字符串', () => {
			const result = inferFieldType(['1e+10', '2e+10']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0);
		});

		it('负零与零值应识别为 integer', () => {
			const result = inferFieldType(['-0', '0', '12']);

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.confidence).toBe(1);
		});

		it('负小数列应识别为 decimal', () => {
			const result = inferFieldType(['-1.25', '-0.5', '3.75']);

			expect(result.type).toBe(FieldType.DECIMAL);
			expect(result.confidence).toBe(1);
		});
	});

	describe('日期时间异常格式', () => {
		it('无效日期字符串应回退为字符串', () => {
			const result = inferFieldType(['2023-13-45', '2023-02-30']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0.5); // 无效日期格式能通过正则但无法通过 Date 验证
		});

		it('斜杠日期格式在当前实现下应回退为字符串', () => {
			const result = inferFieldType(['2023/12/31', '2024/01/01']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0);
		});

		it('纯时间字符串应识别为 time', () => {
			const result = inferFieldType(['14:30:00', '09:15:59']);

			expect(result.type).toBe(FieldType.TIME);
			expect(result.confidence).toBe(1);
		});

		it('带时区的 ISO 时间戳应识别为 datetime', () => {
			const result = inferFieldType(['2024-12-31T23:59:59Z', '2024-01-01 08:00:00+08:00']);

			expect(result.type).toBe(FieldType.DATETIME);
			expect(result.confidence).toBe(1);
		});

		it('Unix 时间戳数字在当前实现下应回退为 integer', () => {
			const result = inferFieldType(['1672531200', '1672531300']);

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.confidence).toBe(1);
		});
	});

	describe('特殊字符与编码', () => {
		it('包含表情符号的文本应识别为 string', () => {
			const result = inferFieldType(['hello😀', 'world🚀']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0);
		});

		it('包含零宽字符的文本应识别为 string', () => {
			const result = inferFieldType(['a​b', 'c​d']);

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBe(0);
		});

		it('混合脚本文本应识别为 string', () => {
			const result = inferFieldType(['中文English', 'العربيةMixed', '日本語Text']);

			expect(result.type).toBe(FieldType.STRING);
		});

		it('包含 HTML 标签的文本应识别为 string', () => {
			const result = inferFieldType(['<b>bold</b>', '<script>alert(1)</script>']);

			expect(result.type).toBe(FieldType.STRING);
		});

		it('包含 SQL 注入样式字符的文本应识别为 string', () => {
			const result = inferFieldType(["' OR 1=1 --", 'DROP TABLE users;']);

			expect(result.type).toBe(FieldType.STRING);
		});
	});

	describe('置信度阈值配置', () => {
		it('较低阈值应允许混合整数列保持 integer', () => {
			const result = inferFieldType(['1', '2', 'text'], { confidence_threshold: 0.5 });

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.confidence).toBeCloseTo(2 / 3, 5);
		});

		it('较高阈值应让同一混合整数列回退为 string', () => {
			const result = inferFieldType(['1', '2', 'text'], { confidence_threshold: 0.9 });

			expect(result.type).toBe(FieldType.STRING);
			expect(result.confidence).toBeCloseTo(2 / 3, 5);
		});

		it('strict_mode 在当前实现中不应改变推断结果', () => {
			const looseResult = inferFieldType(['1', '2', 'text'], { confidence_threshold: 0.5 });
			const strictResult = inferFieldType(['1', '2', 'text'], {
				confidence_threshold: 0.5,
				strict_mode: true,
			});

			expect(strictResult).toEqual(looseResult);
		});

		it('max_sample_size 应只截取前 N 个有效样本参与计算', () => {
			const result = inferFieldType(['1', '2', '3', 'oops'], {
				max_sample_size: 2,
				confidence_threshold: 0.9,
			});

			expect(result.type).toBe(FieldType.INTEGER);
			expect(result.sample_count).toBe(2);
			expect(result.sample_values).toEqual(['1', '2']);
		});
	});
});
