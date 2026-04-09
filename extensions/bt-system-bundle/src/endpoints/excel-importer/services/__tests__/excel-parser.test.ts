/**
 * Excel 解析服务单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
	parseExcelFile,
	getSheetNames,
	validateExcelFile,
	getFileInfo,
	sanitizeCellValue,
	sanitizeData,
	removeEmptyRows,
	removeEmptyColumns,
} from '../excel-parser';
import * as XLSX from 'xlsx';

describe('Excel 解析服务', () => {
	describe('validateExcelFile', () => {
		it('应该接受有效的 xlsx 文件', () => {
			const file = new File([''], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
			const result = validateExcelFile(file);

			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('应该接受有效的 xls 文件', () => {
			const file = new File([''], 'test.xls', { type: 'application/vnd.ms-excel' });
			const result = validateExcelFile(file);

			expect(result.valid).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('应该拒绝不支持的文件格式', () => {
			const file = new File([''], 'test.txt', { type: 'text/plain' });
			const result = validateExcelFile(file);

			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('应该拒绝没有扩展名的文件', () => {
			const file = new File([''], 'test', { type: 'application/octet-stream' });
			const result = validateExcelFile(file);

			expect(result.valid).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe('getFileInfo', () => {
		it('应该返回正确的文件信息', () => {
			const content = 'test content';
			const file = new File([content], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

			const info = getFileInfo(file);

			expect(info.name).toBe('test.xlsx');
			expect(info.size).toBe(content.length);
			expect(info.size_mb).toBeGreaterThan(0);
			expect(info.last_modified).toBeDefined();
		});
	});

	describe('sanitizeCellValue', () => {
		it('应该处理 null 值', () => {
			expect(sanitizeCellValue(null)).toBe(null);
		});

		it('应该处理 undefined 值', () => {
			expect(sanitizeCellValue(undefined)).toBe(null);
		});

		it('应该处理空字符串', () => {
			expect(sanitizeCellValue('')).toBe(null);
			expect(sanitizeCellValue('   ')).toBe(null);
		});

		it('应该修剪字符串', () => {
			expect(sanitizeCellValue('  test  ')).toBe('test');
		});

		it('应该处理日期对象', () => {
			const date = new Date('2024-01-01T00:00:00Z');
			const result = sanitizeCellValue(date);

			expect(typeof result).toBe('string');
			expect(result).toContain('2024-01-01');
		});

		it('应该保持数字不变', () => {
			expect(sanitizeCellValue(123)).toBe(123);
			expect(sanitizeCellValue(45.67)).toBe(45.67);
		});

		it('应该保持布尔值不变', () => {
			expect(sanitizeCellValue(true)).toBe(true);
			expect(sanitizeCellValue(false)).toBe(false);
		});
	});

	describe('sanitizeData', () => {
		it('应该清理数据中的所有值', () => {
			const data = [
				{ name: '  test  ', age: '  25  ', active: '  true  ' },
				{ name: '', age: null, active: undefined },
			];

			const result = sanitizeData(data);

			expect(result[0].name).toBe('test');
			expect(result[0].age).toBe('25');
			expect(result[0].active).toBe('true');
			expect(result[1].name).toBe(null);
			expect(result[1].age).toBe(null);
			expect(result[1].active).toBe(null);
		});
	});

	describe('removeEmptyRows', () => {
		it('应该移除完全空的行', () => {
			const data = [
				{ name: 'test1', age: '25' },
				{ name: '', age: '' },
				{ name: null, age: null },
				{ name: 'test2', age: '30' },
			];

			const result = removeEmptyRows(data);

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe('test1');
			expect(result[1].name).toBe('test2');
		});

		it('应该保留部分空值的行', () => {
			const data = [
				{ name: 'test1', age: '' },
				{ name: '', age: '25' },
			];

			const result = removeEmptyRows(data);

			expect(result).toHaveLength(2);
		});

		it('应该处理空数组', () => {
			const result = removeEmptyRows([]);
			expect(result).toHaveLength(0);
		});
	});

	describe('removeEmptyColumns', () => {
		it('应该识别完全空的列', () => {
			const data = [
				{ col1: 'value1', col2: '', col3: 'value3' },
				{ col1: 'value2', col2: null, col3: 'value4' },
			];

			const emptyColumns = removeEmptyColumns(data);

			expect(emptyColumns).toContain('col2');
			expect(emptyColumns).not.toContain('col1');
			expect(emptyColumns).not.toContain('col3');
		});

		it('应该处理空数组', () => {
			const result = removeEmptyColumns([]);
			expect(result).toEqual([]);
		});

		it('应该处理没有完全空列的数据', () => {
			const data = [
				{ col1: 'value1', col2: 'value2' },
				{ col1: 'value3', col2: 'value4' },
			];

			const emptyColumns = removeEmptyColumns(data);

			expect(emptyColumns).toHaveLength(0);
		});
	});

	describe('parseExcelFile', () => {
		it('应该解析简单的 Excel 文件', async () => {
			// 创建测试工作簿
			const workbook = XLSX.utils.book_new();
			const worksheet = XLSX.utils.aoa_to_sheet([
				['姓名', '年龄', '分数'],
				['张三', '25', '95.5'],
				['李四', '30', '87.0'],
			]);
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

			// 转换为 Buffer
			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const result = await parseExcelFile(buffer);

			expect(result.sheet_count).toBe(1);
			expect(result.sheets).toHaveLength(1);
			expect(result.sheets[0].sheet_name).toBe('Sheet1');
			expect(result.sheets[0].headers).toEqual(['姓名', '年龄', '分数']);
			expect(result.sheets[0].row_count).toBe(2);
			expect(result.sheets[0].column_count).toBe(3);
		});

		it('应该处理多工作表文件', async () => {
			const workbook = XLSX.utils.book_new();

			const sheet1 = XLSX.utils.aoa_to_sheet([['A', 'B'], ['1', '2']]);
			const sheet2 = XLSX.utils.aoa_to_sheet([['C', 'D'], ['3', '4']]);

			XLSX.utils.book_append_sheet(workbook, sheet1, 'Sheet1');
			XLSX.utils.book_append_sheet(workbook, sheet2, 'Sheet2');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const result = await parseExcelFile(buffer);

			expect(result.sheet_count).toBe(2);
			expect(result.sheets).toHaveLength(2);
		});

		it('应该处理空工作表', async () => {
			const workbook = XLSX.utils.book_new();
			const worksheet = XLSX.utils.aoa_to_sheet([]);
			XLSX.utils.book_append_sheet(workbook, worksheet, 'EmptySheet');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].row_count).toBe(0);
			expect(result.sheets[0].column_count).toBe(0);
		});

		it('应该生成字段映射', async () => {
			const workbook = XLSX.utils.book_new();
			const worksheet = XLSX.utils.aoa_to_sheet([
				['ID', '姓名', '年龄'],
				['1', '张三', '25'],
				['2', '李四', '30'],
			]);
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].fields).toHaveLength(3);
			expect(result.sheets[0].fields[0].primary_key).toBe(true);
			expect(result.sheets[0].fields[0].unique).toBe(true);
		});

		it('应该限制预览行数', async () => {
			const workbook = XLSX.utils.book_new();
			const data = [['Column'], ...Array.from({ length: 100 }, (_, i) => [`row${i}`])];
			const worksheet = XLSX.utils.aoa_to_sheet(data);
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const result = await parseExcelFile(buffer, { max_preview_rows: 5 });

			expect(result.sheets[0].preview_data.length).toBeLessThanOrEqual(5);
			expect(result.sheets[0].row_count).toBe(100);
		});

		it('应该支持自定义表头行', async () => {
			const workbook = XLSX.utils.book_new();
			const worksheet = XLSX.utils.aoa_to_sheet([
				['标题行'],
				['姓名', '年龄'],
				['张三', '25'],
			]);
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const result = await parseExcelFile(buffer, { header_row: 1 });

			expect(result.sheets[0].headers).toEqual(['姓名', '年龄']);
			expect(result.sheets[0].row_count).toBe(1);
		});
	});

	describe('getSheetNames', () => {
		it('应该返回所有工作表名称', async () => {
			const workbook = XLSX.utils.book_new();

			const sheet1 = XLSX.utils.aoa_to_sheet([['A', 'B']]);
			const sheet2 = XLSX.utils.aoa_to_sheet([['C', 'D']]);
			const sheet3 = XLSX.utils.aoa_to_sheet([['E', 'F']]);

			XLSX.utils.book_append_sheet(workbook, sheet1, '数据表');
			XLSX.utils.book_append_sheet(workbook, sheet2, '配置表');
			XLSX.utils.book_append_sheet(workbook, sheet3, '汇总表');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const sheetNames = await getSheetNames(buffer);

			expect(sheetNames).toEqual(['数据表', '配置表', '汇总表']);
		});

		it('应该处理单个工作表', async () => {
			const workbook = XLSX.utils.book_new();
			const worksheet = XLSX.utils.aoa_to_sheet([['A', 'B']]);
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			const sheetNames = await getSheetNames(buffer);

			expect(sheetNames).toHaveLength(1);
			expect(sheetNames[0]).toBe('Sheet1');
		});
	});

	describe('错误处理', () => {
		it('应该处理无效的 Buffer', async () => {
			const invalidBuffer = Buffer.from('invalid excel content');

			await expect(parseExcelFile(invalidBuffer)).rejects.toThrow();
		});

		it('应该处理不存在的工作表', async () => {
			const workbook = XLSX.utils.book_new();
			const worksheet = XLSX.utils.aoa_to_sheet([['A', 'B']]);
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

			const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

			await expect(
				parseExcelFile(buffer, {}, { sheetIndex: 10 })
			).rejects.toThrow();
		});
	});
});
