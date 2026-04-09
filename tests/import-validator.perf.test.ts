import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportAuditLogger, ErrorSeverity } from '../extensions/bt-system-bundle/src/hooks/import-validator/audit-logger';
import { performance } from 'perf_hooks';

describe('ImportAuditLogger Performance', () => {
	let mockKnex: any;
	let logger: ImportAuditLogger;

	beforeEach(() => {
		const mockInsert = vi.fn().mockResolvedValue([1]);
		const mockTable = vi.fn(() => ({
			insert: mockInsert
		}));

		mockKnex = mockTable;
		logger = new ImportAuditLogger(mockKnex as any);
	});

	it('logImportError should execute within 10ms', async () => {
		const record = {
			import_job_id: 1,
			row_number: 1,
			error_type: 'validation',
			error_message: 'Test error',
			severity: ErrorSeverity.ERROR
		};

		const start = performance.now();
		await logger.logImportError(record);
		const end = performance.now();

		const duration = end - start;
		expect(duration).toBeLessThan(10);
	});

	it('logAction should execute within 10ms', async () => {
		const record = {
			action_type: 'CREATE',
			action_category: 'IMPORT',
			status: 'success' as const,
			risk_level: 'low' as const
		};

		const start = performance.now();
		await logger.logAction(record);
		const end = performance.now();

		const duration = end - start;
		expect(duration).toBeLessThan(10);
	});

	it('logImportErrors batch insert should scale efficiently', async () => {
		const records = Array.from({ length: 100 }).map((_, i) => ({
			import_job_id: 1,
			row_number: i + 1,
			error_type: 'validation',
			error_message: 'Test error',
			severity: ErrorSeverity.ERROR
		}));

		const start = performance.now();
		await logger.logImportErrors(records);
		const end = performance.now();

		const duration = end - start;
		// 批量操作平均每条记录不超过 1ms
		expect(duration / records.length).toBeLessThan(1);
		// 总时间不超过 50ms
		expect(duration).toBeLessThan(50);
	});

	it('categorizeError should be cached', async () => {
		const error = {
			message: 'validation error for field name'
		};

		// 第一次调用
		const start1 = performance.now();
		logger.categorizeError(error);
		const end1 = performance.now();

		// 第二次调用（应该使用缓存）
		const start2 = performance.now();
		logger.categorizeError(error);
		const end2 = performance.now();

		// 第二次调用应该更快
		const duration1 = end1 - start1;
		const duration2 = end2 - start2;
		expect(duration2).toBeLessThan(duration1);
	});

	it('analyzeErrorSeverity should be cached', async () => {
		const error = {
			code: '23505',
			message: 'duplicate key error'
		};

		// 第一次调用
		const start1 = performance.now();
		logger.analyzeErrorSeverity(error);
		const end1 = performance.now();

		// 第二次调用（应该使用缓存）
		const start2 = performance.now();
		logger.analyzeErrorSeverity(error);
		const end2 = performance.now();

		// 第二次调用应该更快
		const duration1 = end1 - start1;
		const duration2 = end2 - start2;
		expect(duration2).toBeLessThan(duration1);
	});

	it('concurrent logImportError calls should be efficient', async () => {
		const concurrentCalls = 50;
		const records = Array.from({ length: concurrentCalls }).map((_, i) => ({
			import_job_id: 1,
			row_number: i + 1,
			error_type: 'validation',
			error_message: 'Test error',
			severity: ErrorSeverity.ERROR
		}));

		const start = performance.now();
		await Promise.all(records.map(record => logger.logImportError(record)));
		const end = performance.now();

		const duration = end - start;
		// 并发调用应该总时间合理，不超过串行时间的 50%
		expect(duration).toBeLessThan(concurrentCalls * 5); // 每个调用平均不超过 5ms
	});
});
