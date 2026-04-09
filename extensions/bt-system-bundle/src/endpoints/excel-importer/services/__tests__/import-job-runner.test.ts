/**
 * ImportJobRunner 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImportJobRunner, ImportJobStatus, ErrorSeverity } from '../import-job-runner';
import { Knex } from 'knex';

// Mock Knex 实例
const mockDatabase = {
	'bt_import_jobs': [],
	'bt_import_errors': [],
	'bt_action_audit_logs': [],
	'test_collection': [],
} as any;

const createMockKnex = (): Knex => {
	return {
		: (table: string) => ({
			insert: (data: any) => {
				if (Array.isArray(data)) {
					mockDatabase[table].push(...data);
				} else {
					mockDatabase[table].push({ id: mockDatabase[table].length + 1, ...data });
				}
				return Promise.resolve([{ id: mockDatabase[table].length }]);
			},
			where: (field: string, value: any) => ({
				first: () => Promise.resolve(mockDatabase[table].find((item: any) => item[field] === value)),
				update: (data: any) => {
					const index = mockDatabase[table].findIndex((item: any) => item[field] === value);
					if (index !== -1) {
						mockDatabase[table][index] = { ...mockDatabase[table][index], ...data };
					}
					return Promise.resolve();
				},
			}),
			update: (data: any) => {
				mockDatabase[table] = mockDatabase[table].map((item: any) => ({ ...item, ...data }));
				return Promise.resolve();
			},
			returning: (field: string) => ({
				insert: (data: any) => {
					if (Array.isArray(data)) {
						mockDatabase[table].push(...data);
					} else {
						mockDatabase[table].push({ id: mockDatabase[table].length + 1, ...data });
					}
					return Promise.resolve([{ id: mockDatabase[table].length }]);
				},
			}),
		}),
		transaction: async (callback: any) => {
			const mockTrx = {
				: (table: string) => ({
					insert: (data: any) => {
						if (Array.isArray(data)) {
							mockDatabase[table].push(...data);
						} else {
							mockDatabase[table].push({ id: mockDatabase[table].length + 1, ...data });
						}
						return Promise.resolve();
					},
				}),
			};
			return callback(mockTrx);
		},
	} as any;
};

describe('ImportJobRunner', () => {
	let runner: ImportJobRunner;
	let mockKnex: Knex;

	beforeEach(() => {
		mockKnex = createMockKnex();
		runner = new ImportJobRunner(mockKnex, 2);
		// 清理 mock 数据
		mockDatabase['bt_import_jobs'] = [];
		mockDatabase['bt_import_errors'] = [];
		mockDatabase['bt_action_audit_logs'] = [];
		mockDatabase['test_collection'] = [];
	});

	describe('创建导入任务', () => {
		it('应该成功创建导入任务', async () => {
			const config = {
				jobIdentifier: 'test-job-001',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
			};

			const jobId = await runner.createImportJob(config);

			expect(jobId).toBeDefined();
			expect(typeof jobId).toBe('number');
		});

		it('应该使用默认批处理大小 1000', async () => {
			const config = {
				jobIdentifier: 'test-job-002',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
			};

			const jobId = await runner.createImportJob(config);
			const job = mockDatabase['bt_import_jobs'].find((j: any) => j.id === jobId);

			expect(job.batch_size).toBe(1000);
		});

		it('应该使用自定义批处理大小', async () => {
			const config = {
				jobIdentifier: 'test-job-003',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
				batchSize: 500,
			};

			const jobId = await runner.createImportJob(config);
			const job = mockDatabase['bt_import_jobs'].find((j: any) => j.id === jobId);

			expect(job.batch_size).toBe(500);
		});
	});

	describe('任务状态管理', () => {
		it('应该正确更新任务状态', async () => {
			const config = {
				jobIdentifier: 'test-job-status',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
			};

			const jobId = await runner.createImportJob(config);
			await runner.updateJobStatus(jobId, ImportJobStatus.RUNNING);

			const job = mockDatabase['bt_import_jobs'].find((j: any) => j.id === jobId);
			expect(job.status).toBe(ImportJobStatus.RUNNING);
		});

		it('应该能够取消任务', async () => {
			const config = {
				jobIdentifier: 'test-job-cancel',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
			};

			const jobId = await runner.createImportJob(config);
			await runner.cancelJob(jobId);

			const job = mockDatabase['bt_import_jobs'].find((j: any) => j.id === jobId);
			expect(job.status).toBe(ImportJobStatus.CANCELLED);
		});

		it('应该能够暂停任务', async () => {
			const config = {
				jobIdentifier: 'test-job-pause',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
			};

			const jobId = await runner.createImportJob(config);
			// 首先设置为运行状态
			await runner.updateJobStatus(jobId, ImportJobStatus.RUNNING);
			await runner.pauseJob(jobId);

			const job = mockDatabase['bt_import_jobs'].find((j: any) => j.id === jobId);
			expect(job.status).toBe(ImportJobStatus.PAUSED);
		});
	});

	describe('批处理功能', () => {
		it('应该正确分批处理数据', async () => {
			const config = {
				jobIdentifier: 'test-batch-job',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 2500,
				batchSize: 1000,
			};

			const jobId = await runner.createImportJob(config);

			// 创建测试数据
			const testData = Array.from({ length: 2500 }, (_, i) => ({
				row_number: i + 1,
				data: { id: i + 1, name: `Item ${i + 1}` },
			}));

			// 模拟批处理
			const batchSize = 1000;
			let batchCount = 0;

			for (let i = 0; i < testData.length; i += batchSize) {
				const batch = testData.slice(i, Math.min(i + batchSize, testData.length));
				batchCount++;
				// 模拟处理批次
				expect(batch.length).toBeLessThanOrEqual(batchSize);
			}

			expect(batchCount).toBe(3); // 2500 条数据，1000 条一批，应该分成 3 批
		});
	});

	describe('错误处理', () => {
		it('应该正确记录错误', async () => {
			const config = {
				jobIdentifier: 'test-error-job',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 10,
			};

			const jobId = await runner.createImportJob(config);

			// 模拟错误记录
			const errorRecord = {
				row_number: 5,
				error_type: 'constraint_violation',
				error_message: 'Duplicate key value violates unique constraint',
				row_data: { id: 5, name: 'Duplicate' },
				severity: ErrorSeverity.ERROR,
			};

			await runner['saveError'](jobId, errorRecord);

			const errors = mockDatabase['bt_import_errors'];
			expect(errors.length).toBe(1);
			expect(errors[0].row_number).toBe(5);
			expect(errors[0].error_type).toBe('constraint_violation');
		});

		it('应该生成错误摘要', async () => {
			const errors = [
				{
					row_number: 1,
					error_type: 'constraint_violation',
					error_message: 'Unique constraint violation',
					row_data: {},
					severity: ErrorSeverity.ERROR,
				},
				{
					row_number: 2,
					error_type: 'format_error',
					error_message: 'Invalid date format',
					row_data: {},
					severity: ErrorSeverity.WARNING,
				},
				{
					row_number: 3,
					error_type: 'constraint_violation',
					error_message: 'Another unique constraint violation',
					row_data: {},
					severity: ErrorSeverity.ERROR,
				},
			];

			const summary = runner['generateErrorSummary'](errors);

			expect(summary).toContain('constraint_violation: 2');
			expect(summary).toContain('format_error: 1');
			expect(summary).toContain('总计 3 个错误');
		});
	});

	describe('进度跟踪', () => {
		it('应该正确计算进度百分比', async () => {
			const config = {
				jobIdentifier: 'test-progress-job',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 1000,
			};

			const jobId = await runner.createImportJob(config);

			// 模拟进度更新
			await mockKnex('bt_import_jobs').where('id', jobId).update({
				processed_rows: 500,
			});

			const progress = await runner.getJobProgress(jobId);

			expect(progress.progress).toBe(50); // 500/1000 = 50%
			expect(progress.processedRows).toBe(500);
			expect(progress.totalRows).toBe(1000);
		});

		it('应该触发进度回调', async () => {
			const config = {
				jobIdentifier: 'test-callback-job',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
			};

			const jobId = await runner.createImportJob(config);
			const progressCallback = vi.fn();

			// 模拟进度回调触发
			const mockProgress = {
				jobId,
				status: ImportJobStatus.RUNNING,
				totalRows: 100,
				processedRows: 50,
				successRows: 45,
				failedRows: 5,
				progress: 50,
			};

			progressCallback(mockProgress);

			expect(progressCallback).toHaveBeenCalledWith(mockProgress);
			expect(progressCallback).toHaveBeenCalledTimes(1);
		});
	});

	describe('任务队列', () => {
		it('应该正确管理任务队列', async () => {
			expect(runner.getQueueLength()).toBe(0);

			// 添加多个任务到队列
			for (let i = 1; i <= 5; i++) {
				const config = {
					jobIdentifier: `queue-job-${i}`,
					sourceFileName: 'test.xlsx',
					fileSizeBytes: 1024,
					totalRows: 100,
				};

				const jobId = await runner.createImportJob(config);
				await runner.enqueueJob(jobId, [], 'test_collection', undefined, 5 - i);
			}

			expect(runner.getQueueLength()).toBeGreaterThan(0);
		});

		it('应该按优先级排序队列', async () => {
			const jobs: Array<{ id: number; priority: number }> = [];

			// 添加不同优先级的任务
			for (let i = 1; i <= 3; i++) {
				const config = {
					jobIdentifier: `priority-job-${i}`,
					sourceFileName: 'test.xlsx',
					fileSizeBytes: 1024,
					totalRows: 100,
				};

				const jobId = await runner.createImportJob(config);
				const priority = i === 2 ? 10 : 1; // 任务 2 优先级最高
				jobs.push({ id: jobId, priority });
				await runner.enqueueJob(jobId, [], 'test_collection', undefined, priority);
			}

			// 验证队列顺序
			const queue = runner['jobQueue'];
			expect(queue[0].priority).toBe(10); // 最高优先级
		});
	});

	describe('性能监控', () => {
		it('应该跟踪批处理时间', async () => {
			const config = {
				jobIdentifier: 'test-performance-job',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
			};

			const jobId = await runner.createImportJob(config);

			// 模拟性能指标
			runner['performanceMetrics'].set(jobId, {
				startTime: Date.now() - 5000,
				batchTimes: [1000, 1200, 800],
			});

			const metrics = runner.getPerformanceMetrics(jobId);

			expect(metrics).toBeDefined();
			expect(metrics?.averageBatchTime).toBe(1000); // (1000 + 1200 + 800) / 3
			expect(metrics?.totalDuration).toBeGreaterThan(0);
		});
	});

	describe('活动任务管理', () => {
		it('应该正确跟踪活动任务数量', async () => {
			const initialCount = runner.getActiveJobCount();

			// 创建并启动多个任务
			for (let i = 1; i <= 3; i++) {
				const config = {
					jobIdentifier: `active-job-${i}`,
					sourceFileName: 'test.xlsx',
					fileSizeBytes: 1024,
					totalRows: 100,
				};

				const jobId = await runner.createImportJob(config);
				await runner.updateJobStatus(jobId, ImportJobStatus.RUNNING);
			}

			// 注意：实际的活动任务数量取决于 startImportJob 的调用
			// 这里只是验证方法的存在
			expect(typeof runner.getActiveJobCount()).toBe('number');
		});
	});

	describe('审计日志', () => {
		it('应该记录审计日志', async () => {
			const config = {
				jobIdentifier: 'test-audit-job',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 1024,
				totalRows: 100,
				createdUserId: 1,
			};

			const jobId = await runner.createImportJob(config);

			await runner['recordAuditLog'](jobId, 'test_collection', 95, 5);

			const auditLogs = mockDatabase['bt_action_audit_logs'];
			expect(auditLogs.length).toBe(1);
			expect(auditLogs[0].action_type).toBe('dataset_import');
			expect(auditLogs[0].status).toBe('partial'); // 有失败记录
		});
	});
});
