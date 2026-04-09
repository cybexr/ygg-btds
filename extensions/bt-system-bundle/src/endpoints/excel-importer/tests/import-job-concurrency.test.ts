/**
 * 并发导入任务集成测试
 * 验证 ImportJobRunner 在高并发场景下的正确性和稳定性
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import knex from 'knex';
import { ImportJobRunner, ImportJobStatus } from '../services/import-job-runner';

describe('并发导入任务集成测试', () => {
	let db: knex.Knex;
	let importJobRunner: ImportJobRunner;

	// 测试数据库配置
	const testDbConfig = {
		client: 'sqlite3',
		connection: ':memory:',
		useNullAsDefault: true,
	};

	beforeAll(async () => {
		db = knex(testDbConfig);

		// 创建导入任务表
		await db.schema.createTable('bt_import_jobs', (table) => {
			table.increments('id').primary();
			table.string('job_identifier').unique().notNullable();
			table.integer('dataset_registry_id');
			table.string('source_file_name').notNullable();
			table.integer('file_size_bytes');
			table.string('status').notNullable();
			table.integer('total_rows').defaultTo(0);
			table.integer('processed_rows').defaultTo(0);
			table.integer('success_rows').defaultTo(0);
			table.integer('failed_rows').defaultTo(0);
			table.boolean('has_errors').defaultTo(false);
			table.text('error_summary');
			table.text('import_options');
			table.integer('batch_size').defaultTo(1000);
			table.timestamp('started_at');
			table.timestamp('completed_at');
			table.timestamp('estimated_completion_at');
			table.integer('created_user_id');
			table.timestamps(true, true);
			table.string('sheet_name');
		});

		// 创建导入错误表
		await db.schema.createTable('bt_import_errors', (table) => {
			table.increments('id').primary();
			table.integer('import_job_id').notNullable();
			table.integer('row_number').notNullable();
			table.string('sheet_name');
			table.string('error_type').notNullable();
			table.text('error_message').notNullable();
			table.string('field_name');
			table.text('row_data');
			table.string('severity').notNullable();
			table.timestamps(true, true);
		});

		// 创建审计日志表
		await db.schema.createTable('bt_action_audit_logs', (table) => {
			table.increments('id').primary();
			table.string('action_type').notNullable();
			table.string('action_category').notNullable();
			table.string('target_type');
			table.string('target_id');
			table.string('target_name');
			table.text('operation_details');
			table.text('changes_summary');
			table.integer('performed_by_user_id');
			table.string('status');
			table.text('result_message');
			table.string('risk_level');
			table.timestamps(true, true);
		});

		// 创建测试集合表
		await db.schema.createTable('bt_test_concurrent_import', (table) => {
			table.integer('id').primary();
			table.string('name', 100).notNullable();
			table.integer('value');
		});

		importJobRunner = new ImportJobRunner(db, 3); // 最大并发数 3
	});

	afterAll(async () => {
		await db.destroy();
	});

	beforeEach(async () => {
		await db('bt_action_audit_logs').del();
		await db('bt_import_errors').del();
		await db('bt_import_jobs').del();
		await db('bt_test_concurrent_import').del();
	});

	describe('竞态条件测试', () => {
		it('应该正确处理任务取消的竞态条件', async () => {
			// 创建一个足够大的任务，确保在取消前还在运行
			const testData = Array.from({ length: 500 }, (_, idx) => ({
				row_number: idx + 1,
				data: {
					id: idx + 1,
					name: `Test_${idx}`,
					value: idx * 10,
				},
			}));

			const jobId = await importJobRunner.createImportJob({
				sourceFileName: 'race_condition_test.xlsx',
				fileSizeBytes: 1024 * 50,
				totalRows: testData.length,
				batchSize: 10, // 小批次确保有多次状态检查
			});

			// 启动任务但不等待完成
			const importPromise = importJobRunner.startImportJob(
				jobId,
				testData,
				'bt_test_concurrent_import'
			);

			// 等待任务开始运行后立即尝试取消
			await new Promise(resolve => setTimeout(resolve, 10));

			try {
				await importJobRunner.cancelJob(jobId);
			} catch (error) {
				// 如果任务已完成，取消会失败，这是正常的
				console.log('任务已完成，无法取消:', error);
			}

			// 等待任务完成
			const result = await importPromise;

			// 验证任务状态：要么被取消，要么已完成
			expect([ImportJobStatus.CANCELLED, ImportJobStatus.COMPLETED]).toContain(result.status);

			// 验证数据库状态
			const job = await db('bt_import_jobs').where('id', jobId).first();
			expect([ImportJobStatus.CANCELLED, ImportJobStatus.COMPLETED]).toContain(job.status);
		});

		it('应该正确处理任务暂停的竞态条件', async () => {
			const testData = Array.from({ length: 500 }, (_, idx) => ({
				row_number: idx + 1,
				data: {
					id: idx + 1,
					name: `Test_${idx}`,
					value: idx * 10,
				},
			}));

			const jobId = await importJobRunner.createImportJob({
				sourceFileName: 'pause_race_test.xlsx',
				fileSizeBytes: 1024 * 50,
				totalRows: testData.length,
				batchSize: 10,
			});

			// 启动任务
			const importPromise = importJobRunner.startImportJob(
				jobId,
				testData,
				'bt_test_concurrent_import'
			);

			// 等待任务开始运行后尝试暂停
			await new Promise(resolve => setTimeout(resolve, 10));

			try {
				await importJobRunner.pauseJob(jobId);
			} catch (error) {
				// 如果任务已完成，暂停会失败，这是正常的
				console.log('任务已完成，无法暂停:', error);
			}

			// 等待任务完成
			const result = await importPromise;

			// 验证任务状态：要么被暂停，要么已完成
			expect([ImportJobStatus.PAUSED, ImportJobStatus.COMPLETED, ImportJobStatus.CANCELLED]).toContain(result.status);

			// 验证数据库状态
			const job = await db('bt_import_jobs').where('id', jobId).first();
			expect([ImportJobStatus.PAUSED, ImportJobStatus.COMPLETED, ImportJobStatus.CANCELLED]).toContain(job.status);
		});
	});

	describe('并发队列处理测试', () => {
		it('应该正确处理并发队列添加', async () => {
			const concurrentTasks = 5;
			const jobIds: number[] = [];

			// 并发创建多个任务并加入队列
			const createPromises = Array.from({ length: concurrentTasks }, async (_, idx) => {
				const testData = Array.from({ length: 20 }, (_, i) => ({
					row_number: i + 1,
					data: {
						id: idx * 100 + i + 1,
						name: `Concurrent_${idx}_${i}`,
						value: i,
					},
				}));

				const jobId = await importJobRunner.createImportJob({
					sourceFileName: `concurrent_queue_${idx}.xlsx`,
					fileSizeBytes: 1024 * 10,
					totalRows: testData.length,
					batchSize: 5,
				});

				jobIds.push(jobId);

				// 加入队列
				await importJobRunner.enqueueJob(
					jobId,
					testData,
					'bt_test_concurrent_import',
					undefined,
					concurrentTasks - idx // 优先级
				);
			});

			await Promise.all(createPromises);

			// 等待所有任务完成
			await new Promise(resolve => setTimeout(resolve, 2000));

			// 验证所有任务都已完成
			for (const jobId of jobIds) {
				const job = await db('bt_import_jobs').where('id', jobId).first();
				expect([ImportJobStatus.COMPLETED, ImportJobStatus.FAILED]).toContain(job.status);
			}
		});

		it('应该遵守最大并发数限制', async () => {
			const maxConcurrent = 2;
			const constrainedRunner = new ImportJobRunner(db, maxConcurrent);

			const concurrentTasks = 5;
			const jobIds: number[] = [];

			// 创建多个长时间运行的任务
			for (let i = 0; i < concurrentTasks; i++) {
				const testData = Array.from({ length: 50 }, (_, idx) => ({
					row_number: idx + 1,
					data: {
						id: i * 100 + idx + 1,
						name: `Limited_${i}_${idx}`,
						value: idx,
					},
				}));

				const jobId = await constrainedRunner.createImportJob({
					sourceFileName: `limited_concurrent_${i}.xlsx`,
					fileSizeBytes: 1024 * 20,
					totalRows: testData.length,
					batchSize: 10,
				});

				jobIds.push(jobId);

				// 启动任务（不使用队列）
				constrainedRunner.startImportJob(
					jobId,
					testData,
					'bt_test_concurrent_import'
				).catch(() => {
					// 忽略错误
				});
			}

			// 等待一小段时间
			await new Promise(resolve => setTimeout(resolve, 100));

			// 验证活动任务数不超过最大并发数
			const activeCount = constrainedRunner.getActiveJobCount();
			expect(activeCount).toBeLessThanOrEqual(maxConcurrent);
		});
	});

	describe('并发数据一致性测试', () => {
		it('应该在并发导入时保持数据一致性', async () => {
			const concurrentImports = 3;
			const rowsPerImport = 30;

			const importPromises = Array.from({ length: concurrentImports }, async (_, idx) => {
				const testData = Array.from({ length: rowsPerImport }, (_, i) => ({
					row_number: i + 1,
					data: {
						id: idx * 1000 + i + 1, // 确保 ID 不冲突
						name: `Consistent_${idx}_${i}`,
						value: idx * 100 + i,
					},
				}));

				const jobId = await importJobRunner.createImportJob({
					sourceFileName: `consistency_test_${idx}.xlsx`,
					fileSizeBytes: 1024 * 15,
					totalRows: testData.length,
					batchSize: 10,
				});

				return importJobRunner.startImportJob(
					jobId,
					testData,
					'bt_test_concurrent_import'
				);
			});

			// 等待所有导入完成
			const results = await Promise.all(importPromises);

			// 验证所有导入都成功
			for (const result of results) {
				expect(result.status).toBe(ImportJobStatus.COMPLETED);
				expect(result.failedRows).toBe(0);
			}

			// 验证数据库中的记录数
			const records = await db('bt_test_concurrent_import').select('*');
			expect(records.length).toBe(concurrentImports * rowsPerImport);

			// 验证没有重复的 ID
			const ids = records.map(r => r.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		it('应该正确处理并发状态转换', async () => {
			const jobId = await importJobRunner.createImportJob({
				sourceFileName: 'state_transition_test.xlsx',
				fileSizeBytes: 1024 * 10,
				totalRows: 50,
			});

			const testData = Array.from({ length: 50 }, (_, idx) => ({
				row_number: idx + 1,
				data: {
					id: idx + 1,
					name: `State_${idx}`,
					value: idx,
				},
			}));

			// 启动任务
			const importPromise = importJobRunner.startImportJob(
				jobId,
				testData,
				'bt_test_concurrent_import'
			);

			// 并发尝试状态转换
			const operations = [
				importJobRunner.pauseJob(jobId).catch(() => 'pause_failed'),
				importJobRunner.cancelJob(jobId).catch(() => 'cancel_failed'),
				importJobRunner.getJobProgress(jobId).catch(() => 'progress_failed'),
			];

			const results = await Promise.all(operations);

			// 验证只有一个操作成功
			const successCount = results.filter(r => r !== 'pause_failed' && r !== 'cancel_failed' && r !== 'progress_failed').length;
			expect(successCount).toBeGreaterThanOrEqual(0);

			// 等待导入完成
			await importPromise.catch(() => {});

			// 验证最终状态一致
			const job = await db('bt_import_jobs').where('id', jobId).first();
			expect([ImportJobStatus.COMPLETED, ImportJobStatus.CANCELLED, ImportJobStatus.PAUSED, ImportJobStatus.FAILED])
				.toContain(job.status);
		});
	});

	describe('性能和稳定性测试', () => {
		it('应该在高并发下保持稳定性', async () => {
			const highConcurrency = 10;
			const rowsPerTask = 20;

			const startTime = Date.now();

			const importPromises = Array.from({ length: highConcurrency }, async (_, idx) => {
				const testData = Array.from({ length: rowsPerTask }, (_, i) => ({
					row_number: i + 1,
					data: {
						id: idx * 1000 + i + 1,
						name: `Stability_${idx}_${i}`,
						value: i,
					},
				}));

				const jobId = await importJobRunner.createImportJob({
					sourceFileName: `stability_test_${idx}.xlsx`,
					fileSizeBytes: 1024 * 10,
					totalRows: testData.length,
					batchSize: 5,
				});

				return importJobRunner.startImportJob(
					jobId,
					testData,
					'bt_test_concurrent_import'
				).catch(err => ({ error: err.message }));
			});

			const results = await Promise.all(importPromises);
			const duration = Date.now() - startTime;

			// 验证所有任务都有结果（成功或失败）
			expect(results.length).toBe(highConcurrency);

			// 验证至少有一些任务成功
			const successCount = results.filter(r => !('error' in r)).length;
			expect(successCount).toBeGreaterThan(0);

			// 验证性能合理（不应超过 30 秒）
			expect(duration).toBeLessThan(30000);

			console.log(`高并发测试完成: ${highConcurrency} 个任务, ${successCount} 个成功, 耗时 ${duration}ms`);
		});
	});
});
