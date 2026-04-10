/**
 * Excel 导入 API 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExcelImportService } from '../services/excel-import-service';
import { TaskStatus } from '../types';
import { createUploadHandler } from '../routes';

describe('ExcelImportService', () => {
        let service: ExcelImportService;
        const taskIdPattern = /^excel_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
                        expect(taskId).toMatch(taskIdPattern);
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

        describe('createUploadHandler', () => {
                it('应该拒绝伪装成 xlsx 的非法文件', async () => {
                        const handler = createUploadHandler({
                                config: {
                                        maxFileSizeBytes: 10 * 1024 * 1024,
                                        validationTimeoutMs: 500,
                                        parserTimeoutMs: 30_000,
                                        parserMaxCells: 1_000_000,
                                        parserMaxSheets: 10,
                                        enableVirusScan: false,
                                        virusScanTimeoutMs: 500,
                                },
                                virusScanner: {
                                        scanFile: vi.fn(),
                                },
                        });
                        const req = {
                                files: {
                                        file: {
                                                name: 'payload.xlsx',
                                                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                                size: 32,
                                                data: Buffer.from('not-a-zip'),
                                        },
                                },
                        } as any;
                        const res = createMockResponse();

                        await handler(req, res);

                        expect(res.status).toHaveBeenCalledWith(400);
                        expect(res.json).toHaveBeenCalledWith(
                                expect.objectContaining({
                                        error: 'INVALID_FILE_SIGNATURE',
                                })
                        );
                });

                it('应该在扫描通过后创建上传任务', async () => {
                        const scanFile = vi.fn().mockResolvedValue({
                                clean: true,
                                engine: 'mock',
                        });
                        const handler = createUploadHandler({
                                config: {
                                        maxFileSizeBytes: 10 * 1024 * 1024,
                                        validationTimeoutMs: 500,
                                        parserTimeoutMs: 30_000,
                                        parserMaxCells: 1_000_000,
                                        parserMaxSheets: 10,
                                        enableVirusScan: true,
                                        virusScanTimeoutMs: 500,
                                },
                                virusScanner: {
                                        scanFile,
                                },
                        });
                        const req = {
                                files: {
                                        file: {
                                                name: '客户 数据.xlsx',
                                                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                                size: VALID_XLSX_BUFFER.length,
                                                data: VALID_XLSX_BUFFER,
                                        },
                                },
                        } as any;
                        const res = createMockResponse();

                        await handler(req, res);

                        expect(scanFile).toHaveBeenCalled();
                        expect(res.json).toHaveBeenCalledWith(
                                expect.objectContaining({
                                        success: true,
                                        task_id: expect.stringMatching(/^excel_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
                                })
                        );
                });
        });
});

const VALID_XLSX_BUFFER = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.from('[Content_Types].xml xl/workbook.xml'),
        Buffer.from([0x50, 0x4b, 0x05, 0x06]),
]);

function createMockResponse() {
        return {
                status: vi.fn().mockReturnThis(),
                json: vi.fn().mockReturnThis(),
        };
}
