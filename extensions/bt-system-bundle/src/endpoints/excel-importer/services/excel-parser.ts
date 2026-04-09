/**
 * Excel 解析服务 - 使用 xlsx 库解析 Excel 文件
 */

import * as XLSX from 'xlsx';
import { ExcelParseResult, SheetParseResult, FieldMapping } from '../types';
import { createFieldMappings, TypeInferenceConfig } from './type-inference';

/**
 * Excel 解析配置
 */
export interface ExcelParserConfig {
	max_preview_rows?: number; // 最大预览行数
	max_sheets?: number; // 最大工作表数量
	skip_empty_rows?: boolean; // 是否跳过空行
	header_row?: number; // 表头行索引（从 0 开始）
	type_inference?: TypeInferenceConfig; // 类型推断配置
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<ExcelParserConfig> = {
	max_preview_rows: 10,
	max_sheets: 10,
	skip_empty_rows: true,
	header_row: 0,
	type_inference: {
		max_sample_size: 100,
		strict_mode: false,
		confidence_threshold: 0.7,
	},
};

/**
 * 解析选项
 */
interface ParseOptions {
	sheetNames?: string[]; // 要解析的工作表名称，默认全部
	sheetIndex?: number; // 要解析的工作表索引
}

/**
 * 解析 Excel 文件
 */
export async function parseExcelFile(
	file: File | Buffer | ArrayBuffer,
	config: ExcelParserConfig = {},
	options: ParseOptions = {}
): Promise<ExcelParseResult> {
	const mergedConfig = { ...DEFAULT_CONFIG, ...config };

	// 读取工作簿
	const workbook = await readWorkbook(file);

	// 获取要解析的工作表
	let sheetNames = options.sheetNames || workbook.SheetNames;
	if (options.sheetIndex !== undefined) {
		sheetNames = [workbook.SheetNames[options.sheetIndex]];
	}

	// 限制工作表数量
	sheetNames = sheetNames.slice(0, mergedConfig.max_sheets);

	// 解析每个工作表
	const sheets: SheetParseResult[] = [];
	for (const sheetName of sheetNames) {
		const sheetResult = await parseSheet(workbook, sheetName, mergedConfig);
		sheets.push(sheetResult);
	}

	// 获取文件名
	const fileName = file instanceof File ? file.name : 'unknown.xlsx';

	return {
		file_name: fileName,
		sheet_count: sheets.length,
		sheets,
	};
}

/**
 * 读取工作簿
 */
async function readWorkbook(file: File | Buffer | ArrayBuffer): Promise<XLSX.WorkBook> {
	let buffer: Buffer | ArrayBuffer;

	if (file instanceof File) {
		buffer = await file.arrayBuffer();
	} else {
		buffer = file;
	}

	return XLSX.read(buffer, {
		type: 'array',
		cellDates: true, // 解析日期
		cellText: false, // 不转换为文本
		cellNF: true, // 保留数字格式
	});
}

/**
 * 解析单个工作表
 */
function parseSheet(
	workbook: XLSX.WorkBook,
	sheetName: string,
	config: Required<ExcelParserConfig>
): SheetParseResult {
	const worksheet = workbook.Sheets[sheetName];
	if (!worksheet) {
		throw new Error(`工作表 "${sheetName}" 不存在`);
	}

	// 转换为 JSON
	const jsonData = XLSX.utils.sheet_to_json(worksheet, {
		header: 1, // 使用数组格式
		defval: null, // 默认值
		blankrows: !config.skip_empty_rows, // 是否保留空行
	}) as any[][];

	if (jsonData.length === 0) {
		return createEmptySheetResult(sheetName);
	}

	// 提取表头
	const headerRowIndex = config.header_row;
	const headers = extractHeaders(jsonData, headerRowIndex);

	// 提取数据行
	const dataRows = extractDataRows(jsonData, headerRowIndex);

	// 转换为对象数组
	const records = convertToRecords(headers, dataRows);

	// 推断字段类型
	const fields = createFieldMappings(headers, records, config.type_inference);

	// 生成预览数据
	const previewData = records.slice(0, config.max_preview_rows);

	return {
		sheet_name: sheetName,
		row_count: dataRows.length,
		column_count: headers.length,
		headers,
		fields,
		preview_data: previewData,
	};
}

/**
 * 提取表头
 */
function extractHeaders(data: any[][], headerRowIndex: number): string[] {
	if (headerRowIndex >= data.length) {
		return [];
	}

	const headerRow = data[headerRowIndex];
	return headerRow.map((cell, index) => {
		if (cell === null || cell === undefined) {
			return `Column_${index + 1}`;
		}
		return String(cell).trim();
	});
}

/**
 * 提取数据行
 */
function extractDataRows(data: any[][], headerRowIndex: number): any[][] {
	// 跳过表头行之前的数据
	const startRow = headerRowIndex + 1;

	if (startRow >= data.length) {
		return [];
	}

	return data.slice(startRow);
}

/**
 * 转换为对象数组
 */
function convertToRecords(headers: string[], dataRows: any[][]): Record<string, any>[] {
	return dataRows.map((row) => {
		const record: Record<string, any> = {};
		headers.forEach((header, index) => {
			record[header] = row[index];
		});
		return record;
	});
}

/**
 * 创建空工作表结果
 */
function createEmptySheetResult(sheetName: string): SheetParseResult {
	return {
		sheet_name: sheetName,
		row_count: 0,
		column_count: 0,
		headers: [],
		fields: [],
		preview_data: [],
	};
}

/**
 * 获取工作表列表
 */
export function getSheetNames(file: File | Buffer | ArrayBuffer): Promise<string[]> {
	return readWorkbook(file).then((workbook) => workbook.SheetNames);
}

/**
 * 验证 Excel 文件
 */
export function validateExcelFile(file: File | { name: string; type: string }): { valid: boolean; error?: string } {
	const fileName = file instanceof File ? file.name : file.name;
	const fileExtension = fileName.toLowerCase().split('.').pop();

	const validExtensions = ['xlsx', 'xls', 'csv'];

	if (!fileExtension || !validExtensions.includes(fileExtension)) {
		return {
			valid: false,
			error: `不支持的文件格式：${fileExtension}。支持的格式：${validExtensions.join(', ')}`,
		};
	}

	return { valid: true };
}

/**
 * 获取文件信息
 */
export function getFileInfo(file: File): {
	name: string;
	size: number;
	size_mb: number;
	type: string;
	last_modified: string;
} {
	return {
		name: file.name,
		size: file.size,
		size_mb: file.size / (1024 * 1024),
		type: file.type || 'application/vnd.ms-excel',
		last_modified: new Date(file.lastModified).toISOString(),
	};
}

/**
 * 处理空值和异常数据
 */
export function sanitizeCellValue(value: any): any {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed === '') {
			return null;
		}
		return trimmed;
	}

	if (typeof value === 'object' && value instanceof Date) {
		return value.toISOString();
	}

	return value;
}

/**
 * 批量清理数据
 */
export function sanitizeData(data: Record<string, any>[]): Record<string, any>[] {
	return data.map((row) => {
		const sanitized: Record<string, any> = {};
		for (const [key, value] of Object.entries(row)) {
			sanitized[key] = sanitizeCellValue(value);
		}
		return sanitized;
	});
}

/**
 * 检测并移除完全空的行
 */
export function removeEmptyRows(data: Record<string, any>[]): Record<string, any>[] {
	return data.filter((row) => {
		return Object.values(row).some((value) => value !== null && value !== undefined && value !== '');
	});
}

/**
 * 检测并移除完全空的列
 */
export function removeEmptyColumns(data: Record<string, any>[]): string[] {
	const columns = data.length > 0 ? Object.keys(data[0]) : [];

	const emptyColumns = columns.filter((col) => {
		return data.every((row) => row[col] === null || row[col] === undefined || row[col] === '');
	});

	return emptyColumns;
}
