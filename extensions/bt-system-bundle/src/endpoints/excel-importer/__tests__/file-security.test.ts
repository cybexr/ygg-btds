import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { loadFileUploadConfig } from '../config';
import {
	checkFileMagicNumber,
	sanitizeFileName,
	validateExcelFile,
	validateZipStructure,
} from '../utils/file-validator';
import {
	ClamAvLikeVirusScanner,
	NoOpVirusScanner,
	createVirusScanner,
} from '../utils/virus-scanner';
import { parseExcelFile } from '../services/excel-parser';

describe('Excel 文件安全', () => {
	it('应该清理危险文件名', () => {
		expect(sanitizeFileName('../客户 数据.xlsx')).toBe('_.xlsx');
	});

	it('应该识别合法 xlsx 文件头', () => {
		expect(checkFileMagicNumber(createWorkbookBuffer(), 'xlsx')).toBe(true);
	});

	it('应该拒绝伪装扩展名的文件', async () => {
		const result = await validateExcelFile({
			name: 'payload.xlsx',
			size: 9,
			data: Buffer.from('not-a-zip'),
		});

		expect(result.valid).toBe(false);
		expect(result.issues[0].code).toBe('INVALID_FILE_SIGNATURE');
	});

	it('应该拒绝包含宏的 xlsx 文件', async () => {
		const result = await validateExcelFile({
			name: 'macro.xlsx',
			size: 64,
			data: Buffer.concat([createWorkbookBuffer(), Buffer.from('xl/vbaProject.bin')]),
		});

		expect(result.valid).toBe(false);
		expect(result.issues.some((issue) => issue.code === 'MACRO_DETECTED')).toBe(true);
	});

	it('应该拒绝包含路径穿越的 zip 结构', () => {
		const result = validateZipStructure(
			Buffer.concat([
				Buffer.from([0x50, 0x4b, 0x03, 0x04]),
				Buffer.from('[Content_Types].xml xl/workbook.xml ../evil.txt'),
				Buffer.from([0x50, 0x4b, 0x05, 0x06]),
			])
		);

		expect(result.valid).toBe(false);
	});

	it('应该在超过单元格限制时中断解析', async () => {
		const workbook = XLSX.utils.book_new();
		const rows = [['A', 'B'], ...Array.from({ length: 5 }, (_, index) => [index, index + 1])];
		XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
		const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

		await expect(
			parseExcelFile(buffer, {
				max_cells: 4,
			})
		).rejects.toThrow('超过最大单元格限制');
	});
});

describe('文件上传配置', () => {
	it('应该从环境变量读取配置', () => {
		const config = loadFileUploadConfig({
			EXCEL_UPLOAD_MAX_FILE_SIZE_BYTES: '2048',
			EXCEL_UPLOAD_ENABLE_VIRUS_SCAN: 'true',
			EXCEL_UPLOAD_VIRUS_SCAN_TIMEOUT_MS: '900',
		} as NodeJS.ProcessEnv);

		expect(config.maxFileSizeBytes).toBe(2048);
		expect(config.enableVirusScan).toBe(true);
		expect(config.virusScanTimeoutMs).toBe(900);
	});
});

describe('病毒扫描器', () => {
	it('NoOp 扫描器应该默认放行', async () => {
		const scanner = new NoOpVirusScanner();

		await expect(scanner.scanFile('safe.xlsx', Buffer.from('data'))).resolves.toEqual(
			expect.objectContaining({
				clean: true,
				skipped: true,
			})
		);
	});

	it('应该在未启用时返回 NoOp 扫描器', () => {
		expect(createVirusScanner({} as NodeJS.ProcessEnv)).toBeInstanceOf(NoOpVirusScanner);
	});

	it('应该调用 HTTP 扫描端点', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				clean: false,
				threat: 'EICAR-Test-File',
				engine: 'mock-av',
			}),
		});
		vi.stubGlobal('fetch', fetchMock);
		const scanner = new ClamAvLikeVirusScanner('http://scanner.local/scan');

		await expect(scanner.scanFile('virus.xlsx', Buffer.from('content'))).resolves.toEqual({
			clean: false,
			engine: 'mock-av',
			threat: 'EICAR-Test-File',
		});
		expect(fetchMock).toHaveBeenCalledWith(
			'http://scanner.local/scan',
			expect.objectContaining({
				method: 'POST',
			})
		);
		vi.unstubAllGlobals();
	});
});

function createWorkbookBuffer(): Buffer {
	const workbook = XLSX.utils.book_new();
	const worksheet = XLSX.utils.aoa_to_sheet([
		['姓名', '年龄'],
		['张三', 25],
	]);
	XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
	return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
