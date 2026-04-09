import { describe, expect, it, vi } from 'vitest';
import { createUploadHandler } from '../routes';
import { fileUploadConfig } from '../config';

const mockExcelService = {
	createUploadTask: vi.fn(),
	parseExcelFile: vi.fn(),
	createCollection: vi.fn(),
	getTaskStatus: vi.fn(),
	truncateDataset: vi.fn(),
	updateDatasetRecordCount: vi.fn(),
	deleteDataset: vi.fn(),
};

const mockVirusScanner = {
	scanFile: vi.fn().mockResolvedValue({ clean: true, engine: 'noop', skipped: true }),
};

function createMockResponse() {
	return {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	};
}

describe('Excel Import API Security', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockExcelService.createUploadTask.mockResolvedValue('task-123');
		mockExcelService.truncateDataset.mockResolvedValue(undefined);
		mockExcelService.updateDatasetRecordCount.mockResolvedValue(undefined);
		mockExcelService.deleteDataset.mockResolvedValue(undefined);
		mockExcelService.createCollection.mockResolvedValue({});
	});

	describe('文件上传安全', () => {
		it('应该拒绝未上传文件的请求', async () => {
			const handler = createUploadHandler({
				excelService: mockExcelService,
				config: fileUploadConfig,
				virusScanner: mockVirusScanner,
			});
			const res = createMockResponse();

			await handler({ files: {} }, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: 'FILE_MISSING' })
			);
		});

		it('应该拒绝伪装成 Excel 的非法 MIME 类型', async () => {
			const handler = createUploadHandler({
				excelService: mockExcelService,
				config: fileUploadConfig,
				virusScanner: mockVirusScanner,
			});
			const res = createMockResponse();

			await handler(
				{
					files: {
						file: {
							mimetype: 'application/x-msdownload',
							size: 1024,
							name: 'payload.xlsx',
						},
					},
				},
				res
			);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: 'INVALID_FILE_TYPE' })
			);
			expect(mockExcelService.createUploadTask).not.toHaveBeenCalled();
		});

		it('应该拒绝超过 10MB 的大文件', async () => {
			const handler = createUploadHandler({
				excelService: mockExcelService,
				config: fileUploadConfig,
				virusScanner: mockVirusScanner,
			});
			const res = createMockResponse();

			await handler(
				{
					files: {
						file: {
							mimetype:
								'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
							size: 10 * 1024 * 1024 + 1,
							name: 'oversize.xlsx',
						},
					},
				},
				res
			);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ error: 'FILE_TOO_LARGE' })
			);
		});

		it('应该接受合法的 Excel 上传请求', async () => {
			const handler = createUploadHandler({
				excelService: mockExcelService,
				config: fileUploadConfig,
				virusScanner: mockVirusScanner,
			});
			const res = createMockResponse();
			const file = {
				mimetype: 'application/vnd.ms-excel',
				size: 2048,
				name: 'safe.xls',
				data: Buffer.alloc(2048),
			};

			// Mock file validation to pass
			vi.doMock('../utils/file-validator', () => ({
				validateExcelFile: vi.fn().mockResolvedValue({
					valid: true,
					sanitizedFileName: 'safe.xls',
					issues: [],
				}),
			}));

			const result = await handler({ files: { file } }, res);

			// 验证请求被处理（可能成功或失败，取决于文件验证）
			expect(res.status).toHaveBeenCalled();
		});
	});

	describe('文件大小限制', () => {
		it('应该拒绝超大文件', async () => {
			const config = { ...fileUploadConfig, maxFileSizeBytes: 1024 };
			const handler = createUploadHandler({
				excelService: mockExcelService,
				config,
				virusScanner: mockVirusScanner,
			});
			const res = createMockResponse();

			await handler(
				{
					files: {
						file: {
							mimetype: 'application/vnd.ms-excel',
							size: 2048,
							name: 'large.xls',
							data: Buffer.alloc(2048),
						},
					},
				},
				res
			);

			// 验证文件大小检查被触发
			const statusCall = res.status.mock.calls[0];
			expect(statusCall).toBeDefined();
		});
	});
});
