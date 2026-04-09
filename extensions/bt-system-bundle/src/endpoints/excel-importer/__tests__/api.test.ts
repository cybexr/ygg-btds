/**
 * Excel 导入 API 单元测试
 */

import { ExcelImportService } from '../../../shared/services/excel-import-service';
import { TaskStatus } from '../types';

describe('ExcelImportService', () => {
	let service: ExcelImportService;

	beforeEach(() => {
		service = new ExcelImportService();
	});

	describe('createUploadTask', () => {
		it('should create a task with valid ID', async () => {
			const mockFile = {
				name: 'test.xlsx',
				size: 1024,
			};

			const taskId = await service.createUploadTask(mockFile);

			expect(taskId).toBeTruthy();
			expect(taskId).toMatch(/^excel_\d+_[a-z0-9]+$/);
		});

		it('should store task information', async () => {
			const mockFile = {
				name: 'test.xlsx',
				size: 1024,
			};

			const taskId = await service.createUploadTask(mockFile);
			const task = await service.getTaskStatus(taskId);

			expect(task).toBeTruthy();
			expect(task?.file_name).toBe('test.xlsx');
			expect(task?.file_size).toBe(1024);
			expect(task?.status).toBe(TaskStatus.PENDING);
		});
	});

	describe('getTaskStatus', () => {
		it('should return null for non-existent task', async () => {
			const task = await service.getTaskStatus('non_existent_id');
			expect(task).toBeNull();
		});

		it('should return task status for valid task', async () => {
			const mockFile = {
				name: 'test.xlsx',
				size: 1024,
			};

			const taskId = await service.createUploadTask(mockFile);
			const task = await service.getTaskStatus(taskId);

			expect(task).toBeTruthy();
			expect(task?.id).toBe(taskId);
		});
	});
});
