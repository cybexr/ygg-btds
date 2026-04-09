/**
 * 并发测试：测试并发场景下的数据一致性
 * 验证 ImportJobRunner 和 RegistryService 在并发操作下的正确性
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import knex from 'knex';
import { ImportJobRunner, ImportJobStatus } from '../import-job-runner';
import { RegistryService } from '../registry-service';
import { SchemaBuilder } from '../schema-builder';
import { FieldMapping, FieldType } from '../../types';

describe('并发测试：数据一致性', () => {
	let db: knex.Knex;
	let importJobRunner: ImportJobRunner;
	let registryService: RegistryService;
	let schemaBuilder: SchemaBuilder;

	// 测试数据库配置
	const testDbConfig = {
		client: 'sqlite3',
		connection: ':memory:',
		useNullAsDefault: true,
	};

	beforeAll(async () => {
		db = knex(testDbConfig);

		// 创建 Directus 系统表
		await db.schema.createTable('directus_collections', (table) => {
			table.string('collection').primary();
			table.string('icon');
			table.boolean('hidden');
			table.string('note');
			table.string('collapse');
			table.timestamps(true, true);
		});

		await db.schema.createTable('directus_fields', (table) => {
			table.increments('id').primary();
			table.string('collection');
			table.string('field');
			table.string('interface');
			table.boolean('readonly');
			table.boolean('hidden');
			table.boolean('required');
			table.string('display');
			table.text('options');
			table.text('display_options');
			table.timestamps(true, true);
		});

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

		// 创建数据集注册表
		await db.schema.createTable('bt_dataset_registry', (table) => {
			table.increments('id').primary();
			table.string('collection_name').unique().notNullable();
			table.string('display_name').notNullable();
			table.string('status').notNullable().defaultTo('draft');
			table.string('source_file_name');
			table.integer('record_count').defaultTo(0);
			table.text('field_schema_json');
			table.integer('last_import_job_id');
			table.integer('created_user_id');
			table.integer('updated_user_id');
			table.timestamp('created_at').defaultTo(db.fn.now());
			table.timestamp('updated_at').defaultTo(db.fn.now());
			table.text('description');
			table.text('tags');
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

		schemaBuilder = new SchemaBuilder(db);
		registryService = new RegistryService(db);
		importJobRunner = new ImportJobRunner(db, 2); // 降低并发数以提高稳定性
	});

	afterAll(async () => {
		await db.destroy();
	});

	// 每个测试前清理数据
	beforeEach(async () => {
		await db('bt_action_audit_logs').del();
		await db('bt_import_errors').del();
		await db('bt_import_jobs').del();
		await db('bt_dataset_registry').del();
	});

	describe('并发创建导入任务', () => {
		it('应该正确处理并发创建任务', async () => {
			const concurrentTasks = 5;
			const taskPromises: Promise<number>[] = [];

			// 并发创建多个任务
			for (let i = 0; i < concurrentTasks; i++) {
				const promise = importJobRunner.createImportJob({
					sourceFileName: `concurrent_test_${i}.xlsx`,
					fileSizeBytes: 1024 * 100,
					totalRows: 100,
					batchSize: 10,
					createdUserId: 1,
				});
				taskPromises.push(promise);
			}

			// 等待所有任务创建完成
			const jobIds = await Promise.all(taskPromises);

			// 验证所有任务都已创建
			expect(jobIds).toHaveLength(concurrentTasks);

			// 验证任务 ID 唯一性
			const uniqueJobIds = new Set(jobIds);
			expect(uniqueJobIds.size).toBe(concurrentTasks);

			// 验证数据库中的任务数量
			const jobsInDb = await db('bt_import_jobs').select('id');
			expect(jobsInDb.length).toBe(concurrentTasks);

			// 验证所有任务状态为 PENDING
			const pendingJobs = await db('bt_import_jobs')
				.where('status', ImportJobStatus.PENDING)
				.select('id');
			expect(pendingJobs.length).toBe(concurrentTasks);
		});
	});

	describe('并发数据集注册', () => {
		it('应该正确处理并发注册不同数据集', async () => {
			const concurrentRegistrations = 3;
			const registrationPromises: Promise<any>[] = [];

			// 并发注册多个数据集
			for (let i = 0; i < concurrentRegistrations; i++) {
				const registration = {
					collection_name: `bt_dataset_${i}_${Date.now()}`,
					display_name: `数据集 ${i}`,
					status: 'draft' as const,
					tags: [`tag_${i}`],
					field_schema_json: [],
				};

				const promise = registryService.registerDataset(registration);
				registrationPromises.push(promise);
			}

			// 等待所有注册完成
			const datasets = await Promise.all(registrationPromises);

			// 验证所有数据集都已注册
			expect(datasets).toHaveLength(concurrentRegistrations);

			// 验证数据集名称唯一性
			const collectionNames = datasets.map((d) => d.collection_name);
			const uniqueNames = new Set(collectionNames);
			expect(uniqueNames.size).toBe(concurrentRegistrations);

			// 验证数据库中的记录
			const datasetsInDb = await db('bt_dataset_registry').select('*');
			expect(datasetsInDb.length).toBe(concurrentRegistrations);
		});
	});

	describe('并发查询操作', () => {
		beforeEach(async () => {
			// 准备测试数据
			for (let i = 0; i < 5; i++) {
				await registryService.registerDataset({
					collection_name: `bt_query_test_${i}_${Date.now()}`,
					display_name: `查询测试 ${i}`,
					status: i % 2 === 0 ? 'active' : 'draft',
					tags: [`tag_${i % 2}`],
					field_schema_json: [],
				});
			}
		});

		it('应该正确处理并发查询操作', async () => {
			const queryPromises = [
				registryService.getAllDatasets(),
				registryService.getAllDatasets({ status: 'active' }),
				registryService.getAllDatasets({ status: 'draft' }),
				registryService.getStatistics(),
			];

			const results = await Promise.all(queryPromises);

			// 验证所有查询都成功返回
			expect(results[0].length).toBe(5); // 全部
			expect(results[1].length).toBeGreaterThanOrEqual(1); // active
			expect(results[2].length).toBeGreaterThanOrEqual(1); // draft
			expect(results[3].total_datasets).toBe(5); // 统计
		});
	});

	describe('并发任务状态更新', () => {
		it('应该正确处理并发状态转换', async () => {
			const jobId = await importJobRunner.createImportJob({
				sourceFileName: 'status_test.xlsx',
				fileSizeBytes: 1024 * 100,
				totalRows: 100,
			});

			// 并发尝试不同的状态转换
			const operations = [
				// 尝试暂停任务（应该在运行中才能暂停）
				importJobRunner.pauseJob(jobId).catch(() => {
					/* 预期会失败 */
				}),
				// 尝试恢复任务（应该在暂停状态才能恢复）
				importJobRunner.resumeJob(jobId, [], 'test_collection').catch(() => {
					/* 预期会失败 */
				}),
				// 尝试取消任务
				importJobRunner.cancelJob(jobId),
			];

			await Promise.all(operations);

			// 验证最终状态为 CANCELLED
			const job = await db('bt_import_jobs').where('id', jobId).first();
			expect(job.status).toBe(ImportJobStatus.CANCELLED);
		});
	});

	describe('并发统计数据操作', () => {
		it('应该在并发更新时正确计算统计数据', async () => {
			// 先创建一些数据集
			for (let i = 0; i < 3; i++) {
				await registryService.registerDataset({
					collection_name: `bt_stats_test_${i}_${Date.now()}`,
					display_name: `统计测试 ${i}`,
					status: 'draft',
					record_count: i * 10,
					field_schema_json: [],
				});
			}

			// 并发执行更新和统计查询
			const operations: Promise<any>[] = [];

			// 添加几个统计查询
			for (let i = 0; i < 2; i++) {
				operations.push(registryService.getStatistics());
			}

			// 添加一些更新操作
			operations.push(
				registryService.updateDatasetStatus(
					(await db('bt_dataset_registry').first()).collection_name,
					'active'
				)
			);

			const results = await Promise.all(operations);

			// 验证统计结果一致性
			const stats = results[0] as Awaited<ReturnType<typeof registryService.getStatistics>>;
			expect(stats.total_datasets).toBe(3);
			expect(stats.active_datasets).toBeGreaterThanOrEqual(0);
			expect(stats.total_records).toBeGreaterThanOrEqual(0);
		});
	});

	describe('并发简单数据导入', () => {
		it('应该正确处理并发导入到不同集合', async () => {
			const fieldMappings: FieldMapping[] = [
				{
					field_name: 'id',
					display_name: 'ID',
					type: FieldType.INTEGER,
					nullable: false,
					primary_key: true,
					unique: true,
				},
				{
					field_name: 'name',
					display_name: '名称',
					type: FieldType.STRING,
					nullable: false,
					max_length: 100,
				},
			];

			const concurrentImports = 2;
			const importPromises: Promise<any>[] = [];
			const collectionNames: string[] = [];

			// 为每个并发导入创建不同的集合
			for (let i = 0; i < concurrentImports; i++) {
				const collectionName = `bt_concurrent_import_${i}_${Date.now()}`;
				collectionNames.push(collectionName);

				// 直接使用 knex 创建表，避免 SchemaBuilder 的 information_schema 查询
				await db.schema.createTable(collectionName, (table) => {
					table.integer('id').primary().unique();
					table.string('name', 100).notNullable();
				});

				// 准备测试数据
				const testData = Array.from({ length: 10 }, (_, idx) => ({
					row_number: idx + 1,
					data: {
						id: idx + 1,
						name: `Test_${i}_${idx}`,
					},
				}));

				// 创建任务
				const jobId = await importJobRunner.createImportJob({
					sourceFileName: `test_${i}.xlsx`,
					fileSizeBytes: 1024 * 10,
					totalRows: testData.length,
					batchSize: 5,
				});

				// 启动导入任务
				const importPromise = importJobRunner.startImportJob(
					jobId,
					testData,
					collectionName
				);
				importPromises.push(importPromise);
			}

			// 等待所有导入完成
			const results = await Promise.all(importPromises);

			// 验证所有导入都成功
			for (const result of results) {
				expect(result.status).toBe(ImportJobStatus.COMPLETED);
				expect(result.successRows).toBe(10);
				expect(result.failedRows).toBe(0);
			}

			// 验证数据已正确导入
			for (const collectionName of collectionNames) {
				const records = await db(collectionName).select('*');
				expect(records.length).toBe(10);
			}
		});
	});
});
