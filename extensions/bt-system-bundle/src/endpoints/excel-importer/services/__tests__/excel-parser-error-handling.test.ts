import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
	getSheetNames,
	parseExcelFile,
	removeEmptyColumns,
	removeEmptyRows,
	sanitizeCellValue,
	sanitizeData,
	validateExcelFile,
} from '../excel-parser';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(currentDir, 'fixtures', 'invalid-files');

function createWorkbookBuffer(rows: any[][], options?: { sheetName?: string; hidden?: boolean }): Buffer {
	const workbook = XLSX.utils.book_new();
	const worksheet = XLSX.utils.aoa_to_sheet(rows);
	const sheetName = options?.sheetName ?? 'Sheet1';
	XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

	if (options?.hidden) {
		workbook.Workbook = {
			Sheets: [{ name: sheetName, Hidden: 1 }],
		};
	}

	return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function createMultiSheetWorkbook(count: number): Buffer {
	const workbook = XLSX.utils.book_new();
	for (let index = 0; index < count; index += 1) {
		const worksheet = XLSX.utils.aoa_to_sheet([
			['name', 'value'],
			[`row-${index}`, index],
		]);
		XLSX.utils.book_append_sheet(workbook, worksheet, `Sheet${index + 1}`);
	}

	return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('Excel 解析器错误处理测试', () => {
	describe('异常文件 fixtures', () => {
		it('应该提供至少 6 个异常文件样本', () => {
			const fixtureNames = fs.readdirSync(fixtureDir).filter((fileName) => fileName !== 'README.md');

			expect(fixtureNames.length).toBeGreaterThanOrEqual(6);
			expect(fixtureNames).toContain('corrupted-zip.xlsx');
			expect(fixtureNames).toContain('fake-text.xlsx');
		});

		it('应该为 fixtures 提供说明文档', () => {
			const readme = fs.readFileSync(path.join(fixtureDir, 'README.md'), 'utf8');

			expect(readme).toContain('异常输入样本');
			expect(readme).toContain('corrupted-zip.xlsx');
		});
	});

	describe('文件解析错误处理', () => {
		it('应该将空文件解析为空工作表结果', async () => {
			const result = await parseExcelFile(Buffer.alloc(0));

			expect(result.sheet_count).toBe(1);
			expect(result.sheets[0].row_count).toBe(0);
			expect(result.sheets[0].column_count).toBe(0);
		});

		it('应该拒绝损坏的 zip 文件', async () => {
			const buffer = fs.readFileSync(path.join(fixtureDir, 'corrupted-zip.xlsx'));

			await expect(parseExcelFile(buffer)).rejects.toThrow(/Unsupported ZIP encryption|Unsupported ZIP file|Invalid/i);
		});

		it('应该拒绝中央目录损坏的文件', async () => {
			const buffer = fs.readFileSync(path.join(fixtureDir, 'invalid-central-directory.xlsx'));

			await expect(parseExcelFile(buffer)).rejects.toThrow(/Unsupported ZIP encryption|Unsupported ZIP file|Invalid/i);
		});

		it('应该拒绝不存在的工作表索引', async () => {
			const buffer = createWorkbookBuffer([
				['name'],
				['alpha'],
			]);

			await expect(parseExcelFile(buffer, {}, { sheetIndex: 10 })).rejects.toThrow();
		});

		it('应该拒绝不支持的文件扩展名', () => {
			const result = validateExcelFile({ name: 'malware.exe', type: 'application/octet-stream' });

			expect(result.valid).toBe(false);
			expect(result.error).toContain('不支持的文件格式');
		});

		it('应该接受伪装文件的扩展名校验但在解析阶段失败', () => {
			const result = validateExcelFile({ name: 'fake-text.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

			expect(result.valid).toBe(true);
		});

		it('应该在读取损坏文件工作表名时抛错', async () => {
			const buffer = fs.readFileSync(path.join(fixtureDir, 'corrupted-zip.xlsx'));

			await expect(getSheetNames(buffer)).rejects.toThrow(/Unsupported ZIP encryption|Unsupported ZIP file|Invalid/i);
		});

		it('应该能够解析伪装为 xlsx 的纯文本并返回默认工作表', async () => {
			const buffer = fs.readFileSync(path.join(fixtureDir, 'fake-text.xlsx'));
			const result = await parseExcelFile(buffer);

			expect(result.sheet_count).toBe(1);
			expect(result.sheets[0].sheet_name).toBe('Sheet1');
		});
	});

	describe('资源限制测试', () => {
		it('应该限制解析的工作表数量', async () => {
			const buffer = createMultiSheetWorkbook(12);
			const result = await parseExcelFile(buffer, { max_sheets: 3 });

			expect(result.sheet_count).toBe(3);
			expect(result.sheets.map((sheet) => sheet.sheet_name)).toEqual(['Sheet1', 'Sheet2', 'Sheet3']);
		});

		it('应该限制预览数据行数', async () => {
			const buffer = createWorkbookBuffer([
				['name'],
				['row-1'],
				['row-2'],
				['row-3'],
				['row-4'],
			]);
			const result = await parseExcelFile(buffer, { max_preview_rows: 2 });

			expect(result.sheets[0].row_count).toBe(4);
			expect(result.sheets[0].preview_data).toHaveLength(2);
		});

		it('应该拒绝超过文件大小限制的输入', async () => {
			await expect(parseExcelFile(Buffer.alloc(32), { max_file_bytes: 8 })).rejects.toThrow('文件超过解析器允许的大小限制');
		});

		it('应该拒绝超过单元格数量限制的工作表', async () => {
			const buffer = createWorkbookBuffer([
				['c1', 'c2', 'c3'],
				['1', '2', '3'],
				['4', '5', '6'],
			]);

			await expect(parseExcelFile(buffer, { max_cells: 5 })).rejects.toThrow('超过最大单元格限制');
		});

		it('应该处理超大列数工作表', async () => {
			const headers = Array.from({ length: 120 }, (_, index) => `col_${index}`);
			const values = Array.from({ length: 120 }, (_, index) => `value_${index}`);
			const buffer = createWorkbookBuffer([headers, values]);
			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].column_count).toBe(120);
		});

		it('应该保留大文本单元格内容', async () => {
			const largeValue = 'x'.repeat(32000);
			const buffer = createWorkbookBuffer([
				['description'],
				[largeValue],
			]);
			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].preview_data[0].description).toBe(largeValue);
		});
	});

	describe('数据清理和验证', () => {
		it('应该将 null 和 undefined 清理为 null', () => {
			expect(sanitizeCellValue(null)).toBe(null);
			expect(sanitizeCellValue(undefined)).toBe(null);
		});

		it('应该保留公式错误文本', () => {
			expect(sanitizeCellValue('#DIV/0!')).toBe('#DIV/0!');
		});

		it('应该批量清理混合数据', () => {
			const result = sanitizeData([
				{ name: '  Alice  ', amount: ' 100 ', optional: '' },
			]);

			expect(result[0]).toEqual({
				name: 'Alice',
				amount: '100',
				optional: null,
			});
		});

		it('应该移除完全空白的行', () => {
			const result = removeEmptyRows([
				{ a: 'value', b: '' },
				{ a: null, b: '' },
				{ a: 'kept', b: null },
			]);

			expect(result).toHaveLength(2);
		});

		it('应该识别完全为空的列', () => {
			const result = removeEmptyColumns([
				{ a: 'value', b: '', c: null },
				{ a: 'value-2', b: '', c: null },
			]);

			expect(result).toEqual(['b', 'c']);
		});

		it('应该在没有数据时返回空列列表', () => {
			expect(removeEmptyColumns([])).toEqual([]);
		});
	});

	describe('工作表边界条件', () => {
		it('应该处理只有表头没有数据的工作表', async () => {
			const buffer = createWorkbookBuffer([['name', 'amount']]);
			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].headers).toEqual(['name', 'amount']);
			expect(result.sheets[0].row_count).toBe(0);
		});

		it('应该在表头行超出范围时返回空表头和空数据', async () => {
			const buffer = createWorkbookBuffer([
				['name', 'amount'],
				['alpha', 1],
			]);
			const result = await parseExcelFile(buffer, { header_row: 10 });

			expect(result.sheets[0].headers).toEqual([]);
			expect(result.sheets[0].row_count).toBe(0);
		});

		it('应该处理单个单元格工作表', async () => {
			const buffer = createWorkbookBuffer([['only-header']]);
			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].column_count).toBe(1);
			expect(result.sheets[0].row_count).toBe(0);
		});

		it('应该保留特殊字符工作表名称', async () => {
			const buffer = createWorkbookBuffer(
				[
					['name'],
					['alpha'],
				],
				{ sheetName: '数据-分析(2026)' }
			);
			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].sheet_name).toBe('数据-分析(2026)');
		});

		it('应该支持选择特定工作表索引', async () => {
			const buffer = createMultiSheetWorkbook(3);
			const result = await parseExcelFile(buffer, {}, { sheetIndex: 1 });

			expect(result.sheet_count).toBe(1);
			expect(result.sheets[0].sheet_name).toBe('Sheet2');
		});

		it('应该保留隐藏工作表', async () => {
			const buffer = createWorkbookBuffer(
				[
					['name'],
					['hidden-row'],
				],
				{ sheetName: 'HiddenSheet', hidden: true }
			);
			const result = await parseExcelFile(buffer);

			expect(result.sheets[0].sheet_name).toBe('HiddenSheet');
			expect(result.sheets[0].row_count).toBe(1);
		});
	});

	describe('性能和恢复', () => {
		it('应该在合理时间内完成中等规模文件解析', async () => {
			const rows = Array.from({ length: 2000 }, (_, index) => [`row-${index}`, index]);
			const buffer = createWorkbookBuffer([['name', 'value'], ...rows]);
			const startedAt = Date.now();
			const result = await parseExcelFile(buffer);
			const elapsedMs = Date.now() - startedAt;

			expect(result.sheets[0].row_count).toBe(2000);
			expect(elapsedMs).toBeLessThan(5000);
		});

		it('应该支持并发解析多个文件', async () => {
			const buffers = [
				createWorkbookBuffer([['name'], ['a']]),
				createWorkbookBuffer([['name'], ['b']]),
				createWorkbookBuffer([['name'], ['c']]),
			];
			const results = await Promise.all(buffers.map((buffer) => parseExcelFile(buffer)));

			expect(results).toHaveLength(3);
			expect(results.every((result) => result.sheets[0].row_count === 1)).toBe(true);
		});

		it('应该在一次失败后继续解析有效文件', async () => {
			const invalidBuffer = fs.readFileSync(path.join(fixtureDir, 'corrupted-zip.xlsx'));
			await expect(parseExcelFile(invalidBuffer)).rejects.toThrow();

			const validBuffer = createWorkbookBuffer([
				['name'],
				['recovered'],
			]);
			const result = await parseExcelFile(validBuffer);

			expect(result.sheets[0].preview_data[0].name).toBe('recovered');
		});

		it('应该在失败后仍然可以读取有效文件的工作表名', async () => {
			const invalidBuffer = fs.readFileSync(path.join(fixtureDir, 'corrupted-zip.xlsx'));
			await expect(getSheetNames(invalidBuffer)).rejects.toThrow();

			const validBuffer = createMultiSheetWorkbook(2);
			await expect(getSheetNames(validBuffer)).resolves.toEqual(['Sheet1', 'Sheet2']);
		});
	});
});