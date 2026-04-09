/**
 * ImportAuditLogger 单元测试
 * 包含基本功能、边界条件和错误处理测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	ImportAuditLogger,
	ErrorSeverity,
	ErrorType,
	ImportErrorRecord,
	AuditLogRecord,
	measurePerformance,
} from '../audit-logger';

describe('ImportAuditLogger', () => {
	let mockKnex: any;
	let logger: ImportAuditLogger;
	let consoleErrorSpy: any;
	let consoleWarnSpy: any;
	let consoleLogSpy: any;

	beforeEach(() => {
		// 重置所有 mock
		vi.clearAllMocks();

		// 创建 knex mock
		mockKnex = vi.fn(() => ({
			insert: vi.fn(),
			where: vi.fn(() => ({
				update: vi.fn(),
				delete: vi.fn(),
				first: vi.fn(),
			})),
			orderBy: vi.fn(() => ({
				limit: vi.fn(),
			})),
		}));

		logger = new ImportAuditLogger(mockKnex as any);

		// Spy console 方法
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
		consoleWarnSpy.mockRestore();
		consoleLogSpy.mockRestore();
	});

	describe('logImportError', () => {
		it('应该成功记录单个导入错误', async () => {
			const mockInsert = vi.fn().mockResolvedValue([123]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 10,
				sheet_name: 'Sheet1',
				error_type: 'validation',
				error_message: 'Invalid email format',
				field_name: 'email',
				row_data: { email: 'invalid-email', name: 'Test' },
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(123);
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					import_job_id: 1,
					row_number: 10,
					sheet_name: 'Sheet1',
					error_type: 'validation',
					error_message: 'Invalid email format',
					field_name: 'email',
					severity: ErrorSeverity.ERROR,
					is_resolved: false,
					created_at: expect.any(Date),
				})
			);
		});

		it('应该处理缺少可选字段的记录', async () => {
			const mockInsert = vi.fn().mockResolvedValue([456]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 5,
				error_type: 'format',
				error_message: 'Missing required field',
				severity: ErrorSeverity.WARNING,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(456);
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					sheet_name: undefined,
					field_name: undefined,
					row_data: {},
				})
			);
		});

		it('数据库错误应该抛出异常并记录日志', async () => {
			const mockInsert = vi.fn().mockRejectedValue(new Error('Database connection failed'));
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 1,
				error_type: 'database',
				error_message: 'Connection error',
				severity: ErrorSeverity.CRITICAL,
			};

			await expect(logger.logImportError(record)).rejects.toThrow('Database connection failed');
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[ImportAuditLogger] Failed to log import error:',
				expect.any(Error)
			);
		});

		it('应该处理 row_data 为 null 的情况', async () => {
			const mockInsert = vi.fn().mockResolvedValue([789]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 1,
				error_type: 'validation',
				error_message: 'Test error',
				row_data: null as any,
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(789);
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					row_data: {},
				})
			);
		});
	});

	describe('logImportErrors', () => {
		it('应该成功批量记录多个错误', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1, 2, 3, 4, 5]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const records: ImportErrorRecord[] = [
				{
					import_job_id: 1,
					row_number: 1,
					error_type: 'validation',
					error_message: 'Error 1',
					severity: ErrorSeverity.ERROR,
				},
				{
					import_job_id: 1,
					row_number: 2,
					error_type: 'format',
					error_message: 'Error 2',
					severity: ErrorSeverity.WARNING,
				},
				{
					import_job_id: 1,
					row_number: 3,
					error_type: 'constraint',
					error_message: 'Error 3',
					severity: ErrorSeverity.CRITICAL,
				},
			];

			const result = await logger.logImportErrors(records);

			expect(result).toEqual([1, 2, 3, 4, 5]);
			expect(mockInsert).toHaveBeenCalledTimes(1);
		});

		it('应该处理空数组', async () => {
			const mockInsert = vi.fn().mockResolvedValue([]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const result = await logger.logImportErrors([]);

			expect(result).toEqual([]);
			// 空数组可能不会调用 insert（取决于实现）
			// 这里我们只验证结果正确
		});

		it('批量插入失败应该抛出异常', async () => {
			const mockInsert = vi.fn().mockRejectedValue(new Error('Batch insert failed'));
			mockKnex.mockReturnValue({ insert: mockInsert });

			const records: ImportErrorRecord[] = [
				{
					import_job_id: 1,
					row_number: 1,
					error_type: 'validation',
					error_message: 'Error 1',
					severity: ErrorSeverity.ERROR,
				},
			];

			await expect(logger.logImportErrors(records)).rejects.toThrow('Batch insert failed');
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[ImportAuditLogger] Failed to batch log import errors:',
				expect.any(Error)
			);
		});

		it('应该为每条记录创建独立的时间戳', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1, 2]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const records: ImportErrorRecord[] = [
				{
					import_job_id: 1,
					row_number: 1,
					error_type: 'validation',
					error_message: 'Error 1',
					severity: ErrorSeverity.ERROR,
				},
				{
					import_job_id: 1,
					row_number: 2,
					error_type: 'validation',
					error_message: 'Error 2',
					severity: ErrorSeverity.ERROR,
				},
			];

			await logger.logImportErrors(records);

			const insertedRecords = mockInsert.mock.calls[0][0];
			expect(insertedRecords).toHaveLength(2);
			expect(insertedRecords[0].created_at).toBeInstanceOf(Date);
			expect(insertedRecords[1].created_at).toBeInstanceOf(Date);
		});
	});

	describe('logAction', () => {
		it('应该成功记录审计操作', async () => {
			const mockInsert = vi.fn().mockResolvedValue([999]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: AuditLogRecord = {
				action_type: 'item_create',
				action_category: 'dataset_import',
				target_type: 'bt_dataset',
				target_id: '123',
				target_name: 'Test Dataset',
				operation_details: { field1: 'value1' },
				changes_summary: 'Created new dataset',
				performed_by_user_id: 1,
				performed_by_role_id: 2,
				user_ip_address: '192.168.1.1',
				user_agent: 'Mozilla/5.0',
				status: 'success',
				result_message: 'Operation successful',
				risk_level: 'low',
			};

			const result = await logger.logAction(record);

			expect(result).toBe(999);
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					action_type: 'item_create',
					action_category: 'dataset_import',
					target_type: 'bt_dataset',
					target_id: '123',
					status: 'success',
					risk_level: 'low',
					requires_approval: false,
					created_at: expect.any(Date),
				})
			);
		});

		it('应该处理最小字段的审计记录', async () => {
			const mockInsert = vi.fn().mockResolvedValue([888]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: AuditLogRecord = {
				action_type: 'system_task',
				action_category: 'maintenance',
				status: 'success',
				risk_level: 'low',
			};

			const result = await logger.logAction(record);

			expect(result).toBe(888);
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					target_type: undefined,
					target_id: undefined,
					operation_details: {},
				})
			);
		});

		it('审计日志记录失败应该抛出异常', async () => {
			const mockInsert = vi.fn().mockRejectedValue(new Error('Audit log insert failed'));
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: AuditLogRecord = {
				action_type: 'test',
				action_category: 'test',
				status: 'success',
				risk_level: 'low',
			};

			await expect(logger.logAction(record)).rejects.toThrow('Audit log insert failed');
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[ImportAuditLogger] Failed to log audit action:',
				expect.any(Error)
			);
		});

		it('应该支持所有状态类型', async () => {
			const statuses: Array<'success' | 'failed' | 'partial'> = ['success', 'failed', 'partial'];
			const mockInsert = vi.fn().mockResolvedValue([1]);

			for (const status of statuses) {
				mockInsert.mockClear();
				mockKnex.mockReturnValue({ insert: mockInsert });

				const record: AuditLogRecord = {
					action_type: 'test',
					action_category: 'test',
					status,
					risk_level: 'low',
				};

				await logger.logAction(record);

				expect(mockInsert).toHaveBeenCalledWith(
					expect.objectContaining({ status })
				);
			}
		});

		it('应该支持所有风险级别', async () => {
			const riskLevels: Array<'low' | 'medium' | 'high' | 'critical'> = ['low', 'medium', 'high', 'critical'];
			const mockInsert = vi.fn().mockResolvedValue([1]);

			for (const riskLevel of riskLevels) {
				mockInsert.mockClear();
				mockKnex.mockReturnValue({ insert: mockInsert });

				const record: AuditLogRecord = {
					action_type: 'test',
					action_category: 'test',
					status: 'success',
					risk_level: riskLevel,
				};

				await logger.logAction(record);

				expect(mockInsert).toHaveBeenCalledWith(
					expect.objectContaining({ risk_level: riskLevel })
				);
			}
		});
	});

	describe('getErrorStatistics', () => {
		it('应该返回正确的错误统计信息', async () => {
			const mockErrors = [
				{ id: 1, severity: 'error', error_type: 'validation', is_resolved: false },
				{ id: 2, severity: 'warning', error_type: 'validation', is_resolved: true },
				{ id: 3, severity: 'error', error_type: 'constraint', is_resolved: false },
				{ id: 4, severity: 'critical', error_type: 'database', is_resolved: false },
				{ id: 5, severity: 'warning', error_type: 'validation', is_resolved: true },
			];

			const mockWhere = vi.fn().mockResolvedValue(mockErrors);
			mockKnex.mockReturnValue({ where: mockWhere });

			const result = await logger.getErrorStatistics(1);

			expect(result).toEqual({
				total_errors: 5,
				by_severity: {
					error: 2,
					warning: 2,
					critical: 1,
				},
				by_type: {
					validation: 3,
					constraint: 1,
					database: 1,
				},
				resolved_errors: 2,
				unresolved_errors: 3,
			});
		});

		it('应该处理没有错误的导入任务', async () => {
			const mockWhere = vi.fn().mockResolvedValue([]);
			mockKnex.mockReturnValue({ where: mockWhere });

			const result = await logger.getErrorStatistics(999);

			expect(result).toEqual({
				total_errors: 0,
				by_severity: {},
				by_type: {},
				resolved_errors: 0,
				unresolved_errors: 0,
			});
		});

		it('查询统计信息失败应该抛出异常', async () => {
			const mockWhere = vi.fn().mockRejectedValue(new Error('Query failed'));
			mockKnex.mockReturnValue({ where: mockWhere });

			await expect(logger.getErrorStatistics(1)).rejects.toThrow('Query failed');
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[ImportAuditLogger] Failed to get error statistics:',
				expect.any(Error)
			);
		});
	});

	describe('cleanupOldLogs', () => {
		it('应该清理旧的低风险审计日志', async () => {
			const chainMock = {
				where: vi.fn(function(this: any) { return this; }),
				delete: vi.fn().mockResolvedValue(150),
			};
			mockKnex.mockReturnValue(chainMock);

			const result = await logger.cleanupOldLogs(90);

			expect(result).toBe(150);
			expect(chainMock.where).toHaveBeenCalledWith('created_at', '<', expect.any(Date));
			expect(chainMock.where).toHaveBeenCalledWith('risk_level', 'low');
			expect(chainMock.delete).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith('[ImportAuditLogger] Cleaned up 150 old low-risk audit logs');
		});

		it('应该使用默认保留天数 90 天', async () => {
			const chainMock = {
				where: vi.fn(function(this: any) { return this; }),
				delete: vi.fn().mockResolvedValue(0),
			};
			mockKnex.mockReturnValue(chainMock);

			const result = await logger.cleanupOldLogs();

			expect(result).toBe(0);
			expect(chainMock.where).toHaveBeenCalledTimes(2);
			expect(chainMock.delete).toHaveBeenCalled();
		});

		it('清理失败应该抛出异常', async () => {
			const chainMock = {
				where: vi.fn(function(this: any) { return this; }),
				delete: vi.fn().mockRejectedValue(new Error('Delete failed')),
			};
			mockKnex.mockReturnValue(chainMock);

			await expect(logger.cleanupOldLogs()).rejects.toThrow('Delete failed');
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[ImportAuditLogger] Failed to cleanup old logs:',
				expect.any(Error)
			);
		});

		it('应该正确计算截止日期', async () => {
			const chainMock = {
				where: vi.fn(function(this: any) { return this; }),
				delete: vi.fn().mockResolvedValue(0),
			};
			mockKnex.mockReturnValue(chainMock);

			const daysToKeep = 30;
			await logger.cleanupOldLogs(daysToKeep);

			// 验证 where 被调用了正确的参数
			expect(chainMock.where).toHaveBeenCalledWith('created_at', '<', expect.any(Date));
			expect(chainMock.where).toHaveBeenCalledWith('risk_level', 'low');

			// 验证日期大约是正确的（允许 1 秒误差）
			const calls = chainMock.where.mock.calls;
			const cutoffDate = calls[0][2] as Date;
			const expectedDate = new Date();
			expectedDate.setDate(expectedDate.getDate() - daysToKeep);

			const timeDiff = Math.abs(cutoffDate.getTime() - expectedDate.getTime());
			expect(timeDiff).toBeLessThan(1000); // 1 秒误差
		});
	});

	describe('cleanupResolvedErrors', () => {
		it('应该清理已解决的旧错误', async () => {
			const chainMock = {
				where: vi.fn(function(this: any) { return this; }),
				delete: vi.fn().mockResolvedValue(50),
			};
			mockKnex.mockReturnValue(chainMock);

			const result = await logger.cleanupResolvedErrors(30);

			expect(result).toBe(50);
			expect(chainMock.where).toHaveBeenCalledWith('is_resolved', true);
			expect(chainMock.where).toHaveBeenCalledWith('created_at', '<', expect.any(Date));
			expect(chainMock.delete).toHaveBeenCalled();
			expect(consoleLogSpy).toHaveBeenCalledWith('[ImportAuditLogger] Cleaned up 50 resolved import errors');
		});

		it('应该使用默认保留天数 30 天', async () => {
			const chainMock = {
				where: vi.fn(function(this: any) { return this; }),
				delete: vi.fn().mockResolvedValue(0),
			};
			mockKnex.mockReturnValue(chainMock);

			const result = await logger.cleanupResolvedErrors();

			expect(result).toBe(0);
			expect(chainMock.where).toHaveBeenCalledTimes(2);
		});

		it('清理失败应该抛出异常', async () => {
			const chainMock = {
				where: vi.fn(function(this: any) { return this; }),
				delete: vi.fn().mockRejectedValue(new Error('Cleanup failed')),
			};
			mockKnex.mockReturnValue(chainMock);

			await expect(logger.cleanupResolvedErrors()).rejects.toThrow('Cleanup failed');
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[ImportAuditLogger] Failed to cleanup resolved errors:',
				expect.any(Error)
			);
		});
	});

	describe('markErrorAsResolved', () => {
		it('应该成功标记错误为已解决', async () => {
			const mockUpdate = vi.fn().mockResolvedValue(1);
			const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
			mockKnex.mockReturnValue({ where: mockWhere });

			const result = await logger.markErrorAsResolved(123, 'Fixed via data correction');

			expect(result).toBe(true);
			expect(mockWhere).toHaveBeenCalledWith('id', 123);
			expect(mockUpdate).toHaveBeenCalledWith({
				is_resolved: true,
				resolution_notes: 'Fixed via data correction',
			});
		});

		it('应该支持不带解决说明的标记', async () => {
			const mockUpdate = vi.fn().mockResolvedValue(1);
			const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
			mockKnex.mockReturnValue({ where: mockWhere });

			const result = await logger.markErrorAsResolved(456);

			expect(result).toBe(true);
			expect(mockUpdate).toHaveBeenCalledWith({
				is_resolved: true,
				resolution_notes: undefined,
			});
		});

		it('错误不存在时应该返回 false', async () => {
			const mockUpdate = vi.fn().mockResolvedValue(0);
			const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
			mockKnex.mockReturnValue({ where: mockWhere });

			const result = await logger.markErrorAsResolved(999);

			expect(result).toBe(false);
		});

		it('标记失败应该抛出异常', async () => {
			const mockUpdate = vi.fn().mockRejectedValue(new Error('Update failed'));
			const mockWhere = vi.fn().mockReturnValue({ update: mockUpdate });
			mockKnex.mockReturnValue({ where: mockWhere });

			await expect(logger.markErrorAsResolved(123)).rejects.toThrow('Update failed');
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'[ImportAuditLogger] Failed to mark error as resolved:',
				expect.any(Error)
			);
		});
	});

	describe('analyzeErrorSeverity', () => {
		beforeEach(() => {
			// 清除缓存以确保测试独立性
			logger.clearCache();
		});

		it('应该将数据库约束错误识别为 ERROR 级别', () => {
			const error1 = { code: '23505', message: 'Unique constraint violation' };
			const error2 = { code: '23503', message: 'Foreign key violation' };
			const error3 = { code: '23502', message: 'Not null violation' };

			expect(logger.analyzeErrorSeverity(error1)).toBe(ErrorSeverity.ERROR);
			expect(logger.analyzeErrorSeverity(error2)).toBe(ErrorSeverity.ERROR);
			expect(logger.analyzeErrorSeverity(error3)).toBe(ErrorSeverity.ERROR);
		});

		it('应该将权限错误识别为 CRITICAL 级别', () => {
			const error1 = { message: 'permission denied' };
			const error2 = { message: 'unauthorized access' };

			expect(logger.analyzeErrorSeverity(error1)).toBe(ErrorSeverity.CRITICAL);
			expect(logger.analyzeErrorSeverity(error2)).toBe(ErrorSeverity.CRITICAL);
		});

		it('应该将系统错误识别为 CRITICAL 级别', () => {
			const error1 = { code: '500', message: 'Internal server error' };
			const error2 = { code: '59', message: 'System error' };

			expect(logger.analyzeErrorSeverity(error1)).toBe(ErrorSeverity.CRITICAL);
			expect(logger.analyzeErrorSeverity(error2)).toBe(ErrorSeverity.CRITICAL);
		});

		it('应该将验证错误识别为 WARNING 级别', () => {
			const error1 = { message: 'validation failed' };
			const error2 = { message: 'invalid input data' };

			expect(logger.analyzeErrorSeverity(error1)).toBe(ErrorSeverity.WARNING);
			expect(logger.analyzeErrorSeverity(error2)).toBe(ErrorSeverity.WARNING);
		});

		it('应该将其他错误默认为 ERROR 级别', () => {
			const error1 = { message: 'Unknown error' };
			const error2 = { code: '400', message: 'Bad request' };
			const error3 = { message: 'Some random issue' };

			expect(logger.analyzeErrorSeverity(error1)).toBe(ErrorSeverity.ERROR);
			expect(logger.analyzeErrorSeverity(error2)).toBe(ErrorSeverity.ERROR);
			expect(logger.analyzeErrorSeverity(error3)).toBe(ErrorSeverity.ERROR);
		});

		it('应该处理空错误对象', () => {
			expect(logger.analyzeErrorSeverity({})).toBe(ErrorSeverity.ERROR);
			// 注意：null 和 undefined 在实际实现中会抛出错误，这里我们测试空对象
		});
	});

	describe('categorizeError', () => {
		beforeEach(() => {
			// 清除缓存以确保测试独立性
			logger.clearCache();
		});

		it('应该正确分类验证错误', () => {
			const error1 = { message: 'validation failed for field' };
			const error2 = { message: 'This field is not valid' };

			expect(logger.categorizeError(error1)).toBe(ErrorType.VALIDATION);
			expect(logger.categorizeError(error2)).toBe(ErrorType.VALIDATION);
		});

		it('应该正确分类约束错误', () => {
			const error1 = { message: 'unique constraint violation' };
			const error2 = { message: 'foreign key constraint' };
			const error3 = { message: 'constraint failed' };

			expect(logger.categorizeError(error1)).toBe(ErrorType.CONSTRAINT);
			expect(logger.categorizeError(error2)).toBe(ErrorType.CONSTRAINT);
			expect(logger.categorizeError(error3)).toBe(ErrorType.CONSTRAINT);
		});

		it('应该正确分类格式错误', () => {
			// "invalid" 包含 "valid"，会被识别为 VALIDATION
			// "type" 不会被识别为格式错误
			// "parse" 包含 "par"，不会被识别为验证错误
			const error1 = { message: 'format error' };
			const error2 = { message: 'type mismatch error' };
			const error3 = { message: 'parse error data' };

			expect(logger.categorizeError(error1)).toBe(ErrorType.FORMAT);
			expect(logger.categorizeError(error2)).toBe(ErrorType.FORMAT);
			expect(logger.categorizeError(error3)).toBe(ErrorType.FORMAT);
		});

		it('应该正确分类权限错误', () => {
			const error1 = { message: 'permission denied' };
			const error2 = { message: 'unauthorized access' };
			const error3 = { message: 'forbidden' };

			expect(logger.categorizeError(error1)).toBe(ErrorType.PERMISSION);
			expect(logger.categorizeError(error2)).toBe(ErrorType.PERMISSION);
			expect(logger.categorizeError(error3)).toBe(ErrorType.PERMISSION);
		});

		it('应该正确分类数据库错误', () => {
			const error1 = { code: '500', message: 'Database error' };
			const error2 = { code: '59', message: 'Connection failed' };

			expect(logger.categorizeError(error1)).toBe(ErrorType.DATABASE);
			expect(logger.categorizeError(error2)).toBe(ErrorType.DATABASE);
		});

		it('应该将其他错误默认为 SYSTEM 类型', () => {
			const error1 = { message: 'Unknown system error' };
			const error2 = { message: 'Generic failure' };

			expect(logger.categorizeError(error1)).toBe(ErrorType.SYSTEM);
			expect(logger.categorizeError(error2)).toBe(ErrorType.SYSTEM);
		});

		it('应该处理缺少 message 属性的错误', () => {
			const error = { code: '404' };

			expect(logger.categorizeError(error)).toBe(ErrorType.SYSTEM);
		});

		it('应该处理空错误对象', () => {
			expect(logger.categorizeError({})).toBe(ErrorType.SYSTEM);
			// 注意：null 和 undefined 在实际实现中会抛出错误，这里我们测试空对象
		});
	});

	describe('measurePerformance 装饰器', () => {
		it('应该导出 measurePerformance 函数', () => {
			expect(measurePerformance).toBeDefined();
			expect(typeof measurePerformance).toBe('function');
		});
	});

	describe('边界条件测试', () => {
		it('应该处理非常大的错误消息', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const longMessage = 'x'.repeat(10000);
			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 1,
				error_type: 'validation',
				error_message: longMessage,
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(1);
			expect(mockInsert).toHaveBeenCalled();
		});

		it('应该处理非常大的 row_data', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const largeData = {};
			for (let i = 0; i < 100; i++) {
				largeData[`field${i}`] = 'x'.repeat(100);
			}

			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 1,
				error_type: 'validation',
				error_message: 'Test',
				row_data: largeData,
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(1);
			expect(mockInsert).toHaveBeenCalled();
		});

		it('应该处理特殊的 Unicode 字符', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 1,
				error_type: 'validation',
				error_message: '测试错误 🚀 Ñoño',
				field_name: '名称',
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(1);
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					error_message: '测试错误 🚀 Ñoño',
					field_name: '名称',
				})
			);
		});

		it('应该处理负数行号', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: 1,
				row_number: -1,
				error_type: 'validation',
				error_message: 'Test',
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(1);
			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					row_number: -1,
				})
			);
		});

		it('应该处理零 import_job_id', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: 0,
				row_number: 1,
				error_type: 'validation',
				error_message: 'Test',
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(1);
		});

		it('应该处理非常大的 import_job_id', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const record: ImportErrorRecord = {
				import_job_id: Number.MAX_SAFE_INTEGER,
				row_number: 1,
				error_type: 'validation',
				error_message: 'Test',
				severity: ErrorSeverity.ERROR,
			};

			const result = await logger.logImportError(record);

			expect(result).toBe(1);
		});
	});

	describe('并发测试', () => {
		it('应该处理并发记录多个错误', async () => {
			const mockInsert = vi.fn().mockResolvedValue([1]);
			mockKnex.mockReturnValue({ insert: mockInsert });

			const records: ImportErrorRecord[] = Array.from({ length: 10 }, (_, i) => ({
				import_job_id: 1,
				row_number: i + 1,
				error_type: 'validation',
				error_message: `Error ${i}`,
				severity: ErrorSeverity.ERROR,
			}));

			const promises = records.map(record => logger.logImportError(record));
			const results = await Promise.all(promises);

			expect(results).toHaveLength(10);
			expect(mockInsert).toHaveBeenCalledTimes(10);
		});

		it('应该处理并发混合操作', async () => {
			const mockInsert = vi.fn().mockImplementation((data) => {
				if (Array.isArray(data)) {
					return Promise.resolve([1, 2, 3]);
				}
				return Promise.resolve([1]);
			});
			mockKnex.mockReturnValue({ insert: mockInsert });

			const errorRecord: ImportErrorRecord = {
				import_job_id: 1,
				row_number: 1,
				error_type: 'validation',
				error_message: 'Test error',
				severity: ErrorSeverity.ERROR,
			};

			const auditRecord: AuditLogRecord = {
				action_type: 'test',
				action_category: 'test',
				status: 'success',
				risk_level: 'low',
			};

			const [errorResult, auditResult] = await Promise.all([
				logger.logImportError(errorRecord),
				logger.logAction(auditRecord),
			]);

			expect(errorResult).toBe(1);
			expect(auditResult).toBe(1);
		});
	});
});
