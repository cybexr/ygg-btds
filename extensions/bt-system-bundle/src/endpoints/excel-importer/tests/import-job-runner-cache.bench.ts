import { bench, describe, expect, beforeAll } from 'vitest';
import { Knex } from 'knex';
import { ImportJobRunner, ImportJobStatus, BatchDataItem } from '../services/import-job-runner';

type MockRow = Record<string, any>;
type MockDatabase = Record<string, MockRow[]>;

function createMockQuery(database: MockDatabase, table: string, stats: { selects: number }) {
	let predicate: ((item: MockRow) => boolean) | undefined;

	const matchingRows = () => {
		const rows = database[table] || [];
		return predicate ? rows.filter(predicate) : rows;
	};

	return {
		insert(data: MockRow | MockRow[]) {
			const rows = Array.isArray(data) ? data : [data];
			const inserted = rows.map((row) => {
				const nextRow = row.id ? { ...row } : { id: (database[table]?.length || 0) + 1, ...row };
				database[table].push(nextRow);
				return nextRow;
			});

			return Promise.resolve(inserted.map((row) => ({ id: row.id })));
		},
		where(field: string, value: any) {
			predicate = (item: MockRow) => item[field] === value;
			return this;
		},
		first() {
			if (table === 'bt_import_jobs') {
				stats.selects++;
			}

			const row = matchingRows()[0];
			return Promise.resolve(row ? { ...row } : undefined);
		},
		update(data: MockRow) {
			for (const row of matchingRows()) {
				Object.assign(row, data);
			}
			return Promise.resolve(1);
		},
		returning(_field: string) {
			return {
				insert: (data: MockRow | MockRow[]) => this.insert(data),
			};
		},
	};
}

function createRunner() {
	const database: MockDatabase = {
		bt_import_jobs: [],
		bt_import_errors: [],
		bt_action_audit_logs: [],
		test_collection: [],
	};
	const stats = { selects: 0 };
	const knex = ((table: string) => createMockQuery(database, table, stats)) as unknown as Knex;
	(knex as any).transaction = async (callback: (trx: Knex) => Promise<void>) => callback(knex);

	return { runner: new ImportJobRunner(knex), database, stats };
}

function generateMockData(rowCount: number): BatchDataItem[] {
	const data: BatchDataItem[] = [];
	for (let i = 0; i < rowCount; i++) {
		data.push({
			row_number: i + 1,
			data: {
				field1: `value${i}`,
				field2: i * 2,
				field3: new Date().toISOString(),
			},
		});
	}
	return data;
}

describe('ImportJobRunner cache benchmark', () => {
	let jobId: number;
	let stats: { selects: number };

	beforeAll(async () => {
		const { runner, stats: runnerStats } = createRunner();
		stats = runnerStats;

		jobId = await runner.createImportJob({
			jobIdentifier: 'cache-bench-job',
			sourceFileName: 'bench.xlsx',
			fileSizeBytes: 256,
			totalRows: 100,
		});
		await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);
	});

	describe('状态缓存性能', () => {
		bench('连续状态查询缓存命中测试', async () => {
			const { runner } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'status-cache-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});
			await runner['updateJobStatus'](testJobId, ImportJobStatus.RUNNING);

			// 初始查询（缓存未命中）
			await runner['getCachedJobStatus'](testJobId, true);

			// 连续查询（应该命中缓存）
			for (let i = 0; i < 50; i++) {
				await runner['getCachedJobStatus'](testJobId);
			}

			const metrics = runner.getCacheMetrics(testJobId);
			expect(metrics?.hits).toBeGreaterThan(45);
		});

		bench('高频状态查询性能测试', async () => {
			const { runner } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'high-freq-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});
			await runner['updateJobStatus'](testJobId, ImportJobStatus.RUNNING);

			// 模拟高频查询
			for (let i = 0; i < 100; i++) {
				await runner['getCachedJobStatus'](testJobId);
			}

			const metrics = runner.getCacheMetrics(testJobId);
			expect(metrics?.hits).toBeGreaterThan(95);
			expect(metrics?.averageLookupTime).toBeLessThan(1); // 平均查找时间应小于 1ms
		});
	});

	describe('进度缓存性能', () => {
		bench('进度查询缓存效果测试', async () => {
			const { runner, database } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'progress-cache-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 1000,
			});

			// 模拟进度更新
			for (let i = 0; i < 10; i++) {
				const job = database.bt_import_jobs.find(j => j.id === testJobId);
				if (job) {
					job.processed_rows = (i + 1) * 100;
				}

				// 每次更新后查询多次
				for (let j = 0; j < 5; j++) {
					await runner.getJobProgress(testJobId);
				}
			}

			const metrics = runner.getCacheMetrics(testJobId);
			expect(metrics?.progressHits).toBeGreaterThan(40); // 应该有大量缓存命中
		});

		bench('密集进度查询性能测试', async () => {
			const { runner } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'dense-progress-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 500,
			});

			// 密集查询进度
			for (let i = 0; i < 200; i++) {
				await runner.getJobProgress(testJobId);
			}

			const metrics = runner.getCacheMetrics(testJobId);
			expect(metrics?.progressHits).toBeGreaterThan(190);
		});
	});

	describe('配置缓存性能', () => {
		bench('配置查询缓存命中测试', async () => {
			const { runner } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'config-cache-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			// 首次查询（缓存未命中）
			await runner['getCachedJobConfig'](testJobId);

			// 后续查询（应该命中缓存）
			for (let i = 0; i < 30; i++) {
				await runner['getCachedJobConfig'](testJobId);
			}

			const metrics = runner.getCacheMetrics(testJobId);
			expect(metrics?.configHits).toBeGreaterThan(25);
		});
	});

	describe('综合缓存性能', () => {
		bench('混合查询场景性能测试', async () => {
			const { runner, database } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'mixed-cache-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 1000,
			});
			await runner['updateJobStatus'](testJobId, ImportJobStatus.RUNNING);

			// 混合查询场景
			for (let i = 0; i < 20; i++) {
				// 状态查询
				await runner['getCachedJobStatus'](testJobId);

				// 进度查询
				await runner.getJobProgress(testJobId);

				// 配置查询
				await runner['getCachedJobConfig'](testJobId);

				// 模拟进度更新
				if (i % 5 === 0) {
					const job = database.bt_import_jobs.find(j => j.id === testJobId);
					if (job) {
						job.processed_rows = (i + 1) * 50;
					}
				}
			}

			const metrics = runner.getCacheMetrics(testJobId);
			expect(metrics?.totalHits).toBeGreaterThan(40);
		});

		bench('缓存命中率综合测试', async () => {
			const { runner } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'hit-rate-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 500,
			});
			await runner['updateJobStatus'](testJobId, ImportJobStatus.RUNNING);

			// 执行大量查询
			for (let i = 0; i < 150; i++) {
				await runner['getCachedJobStatus'](testJobId);
				await runner.getJobProgress(testJobId);
			}

			const metrics = runner.getCacheMetrics(testJobId);
			const totalHitRate = metrics?.totalHitRate || 0;

			// 验证缓存命中率大于 75%
			expect(totalHitRate).toBeGreaterThan(0.75);

			console.log(`缓存性能报告:`);
			console.log(`  总命中率: ${(totalHitRate * 100).toFixed(2)}%`);
			console.log(`  状态缓存命中率: ${((metrics?.hitRate || 0) * 100).toFixed(2)}%`);
			console.log(`  进度缓存命中率: ${((metrics?.progressHitRate || 0) * 100).toFixed(2)}%`);
			console.log(`  配置缓存命中率: ${((metrics?.configHitRate || 0) * 100).toFixed(2)}%`);
		});

		bench('数据库查询减少效果测试', async () => {
			const { runner, stats: testStats } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'db-reduction-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 200,
			});
			await runner['updateJobStatus'](testJobId, ImportJobStatus.RUNNING);

			const initialSelects = testStats.selects;

			// 执行大量查询
			for (let i = 0; i < 100; i++) {
				await runner['getCachedJobStatus'](testJobId);
				await runner.getJobProgress(testJobId);
			}

			const finalSelects = testStats.selects;
			const selectCount = finalSelects - initialSelects;

			// 验证数据库查询数量显著减少（应远小于 200）
			expect(selectCount).toBeLessThan(20);

			console.log(`数据库查询优化: ${selectCount} 次查询 vs 200 次请求，减少 ${((1 - selectCount / 200) * 100).toFixed(2)}%`);
		});
	});

	describe('内存使用效率', () => {
		bench('多任务缓存内存测试', async () => {
			const { runner } = createRunner();

			// 创建多个任务
			const jobIds: number[] = [];
			for (let i = 0; i < 10; i++) {
				const id = await runner.createImportJob({
					jobIdentifier: `mem-test-${i}`,
					sourceFileName: 'test.xlsx',
					fileSizeBytes: 256,
					totalRows: 100,
				});
				await runner['updateJobStatus'](id, ImportJobStatus.RUNNING);
				jobIds.push(id);
			}

			// 对每个任务执行查询
			for (const id of jobIds) {
				await runner['getCachedJobStatus'](id);
				await runner.getJobProgress(id);
			}

			// 验证所有任务都有缓存指标
			for (const id of jobIds) {
				const metrics = runner.getCacheMetrics(id);
				expect(metrics).toBeDefined();
			}
		});

		bench('缓存清理效果测试', async () => {
			const { runner } = createRunner();
			const testJobId = await runner.createImportJob({
				jobIdentifier: 'cleanup-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			// 执行查询产生缓存
			for (let i = 0; i < 20; i++) {
				await runner['getCachedJobStatus'](testJobId);
				await runner.getJobProgress(testJobId);
			}

			const beforeCleanup = runner.getCacheMetrics(testJobId);
			expect(beforeCleanup?.totalHits).toBeGreaterThan(30);

			// 清理任务
			await runner.cleanupJob(testJobId);

			const afterCleanup = runner.getCacheMetrics(testJobId);
			expect(afterCleanup).toBeUndefined();
		});
	});
});
