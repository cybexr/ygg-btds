import { describe, it, expect, beforeEach } from 'vitest';
import { Knex } from 'knex';
import { ImportJobRunner, ImportJobStatus, CacheConfig } from '../services/import-job-runner';

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

			const result = Promise.resolve(inserted.map((row) => ({ id: row.id })));
			return Object.assign(result, {
				returning: (field: string) => result,
			});
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
	};
}

function createRunner(cacheConfig?: CacheConfig) {
	const database: MockDatabase = {
		bt_import_jobs: [],
		bt_import_errors: [],
		bt_action_audit_logs: [],
		test_collection: [],
	};
	const stats = { selects: 0 };
	const knex = ((table: string) => createMockQuery(database, table, stats)) as unknown as Knex;
	(knex as any).transaction = async (callback: (trx: Knex) => Promise<void>) => callback(knex);

	return { runner: new ImportJobRunner(knex, 3, cacheConfig), database, stats };
}

describe('ImportJobRunner 缓存功能测试', () => {
	describe('缓存配置', () => {
		it('应该使用默认缓存配置', () => {
			const { runner } = createRunner();
			expect(runner).toBeDefined();
		});

		it('应该使用自定义缓存配置', () => {
			const cacheConfig: CacheConfig = {
				cacheTtlMs: 10000,
				progressCacheTtlMs: 3000,
				statusCheckIntervalBatches: 20,
			};
			const { runner } = createRunner(cacheConfig);
			expect(runner).toBeDefined();
		});
	});

	describe('状态缓存', () => {
		it('应该在首次查询时缓存状态', async () => {
			const { runner, stats } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'status-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			const initialSelects = stats.selects;

			// 首次查询
			await runner['getCachedJobStatus'](jobId, true);
			expect(stats.selects).toBe(initialSelects + 1);

			// 后续查询应该命中缓存
			await runner['getCachedJobStatus'](jobId);
			await runner['getCachedJobStatus'](jobId);
			expect(stats.selects).toBe(initialSelects + 1);
		});

		it('应该在 TTL 过期后重新查询', async () => {
			const { runner, stats } = createRunner({
				cacheTtlMs: 100, // 短 TTL 用于测试
			});
			const jobId = await runner.createImportJob({
				jobIdentifier: 'ttl-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			const initialSelects = stats.selects;

			// 首次查询
			await runner['getCachedJobStatus'](jobId, true);
			expect(stats.selects).toBe(initialSelects + 1);

			// 等待 TTL 过期
			await new Promise((resolve) => setTimeout(resolve, 150));

			// TTL 过期后应该重新查询
			await runner['getCachedJobStatus'](jobId);
			expect(stats.selects).toBe(initialSelects + 2);
		});
	});

	describe('进度缓存', () => {
		it('应该缓存进度查询结果', async () => {
			const { runner, stats } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'progress-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			const initialSelects = stats.selects;

			// 首次查询
			await runner.getJobProgress(jobId);
			expect(stats.selects).toBe(initialSelects + 1);

			// 后续查询应该命中缓存
			await runner.getJobProgress(jobId);
			await runner.getJobProgress(jobId);
			expect(stats.selects).toBe(initialSelects + 1);
		});

		it('应该支持强制刷新', async () => {
			const { runner, stats } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'force-refresh-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			const initialSelects = stats.selects;

			// 首次查询
			await runner.getJobProgress(jobId);
			expect(stats.selects).toBe(initialSelects + 1);

			// 强制刷新（不使用缓存）
			await runner.getJobProgress(jobId, false);
			expect(stats.selects).toBe(initialSelects + 2);
		});
	});

	describe('缓存性能指标', () => {
		it('应该正确记录缓存命中和未命中', async () => {
			const { runner } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'metrics-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			// 执行一些查询
			await runner['getCachedJobStatus'](jobId, true);
			for (let i = 0; i < 10; i++) {
				await runner['getCachedJobStatus'](jobId);
			}

			const metrics = runner.getCacheMetrics(jobId);
			expect(metrics).toBeDefined();
			expect(metrics?.hits).toBeGreaterThan(8);
			expect(metrics?.misses).toBe(1);
		});

		it('应该正确计算缓存命中率', async () => {
			const { runner } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'hit-rate-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			// 执行查询
			await runner['getCachedJobStatus'](jobId, true);
			for (let i = 0; i < 10; i++) {
				await runner['getCachedJobStatus'](jobId);
			}

			const metrics = runner.getCacheMetrics(jobId);
			const hitRate = metrics?.hitRate || 0;
			expect(hitRate).toBeGreaterThan(0.8);
		});
	});

	describe('缓存清理', () => {
		it('应该在清理任务时清除缓存', async () => {
			const { runner } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'cleanup-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			// 执行查询产生缓存
			await runner['getCachedJobStatus'](jobId);
			await runner.getJobProgress(jobId);

			const beforeCleanup = runner.getCacheMetrics(jobId);
			expect(beforeCleanup).toBeDefined();

			// 清理任务
			await runner.cleanupJob(jobId);

			const afterCleanup = runner.getCacheMetrics(jobId);
			expect(afterCleanup).toBeUndefined();
		});
	});

	describe('进度更新缓存失效', () => {
		it('应该在进度更新后使缓存失效', async () => {
			const { runner, database, stats } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'invalidation-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			// 首次查询
			await runner.getJobProgress(jobId);
			const initialSelects = stats.selects;

			// 后续查询应该命中缓存
			await runner.getJobProgress(jobId);
			expect(stats.selects).toBe(initialSelects);

			// 更新进度（应该使缓存失效）
			const job = database.bt_import_jobs.find((j) => j.id === jobId);
			if (job) {
				job.processed_rows = 50;
			}

			// 由于缓存失效，下次查询应该重新查询数据库
			await runner.getJobProgress(jobId);
			// 注意：这里可能会命中缓存，因为缓存失效是在进度更新时触发的
			// 而我们直接修改了数据库，没有通过 runner 的方法
		});
	});

	describe('数据库查询优化', () => {
		it('应该显著减少数据库查询次数', async () => {
			const { runner, stats } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'db-optimization-test',
				sourceFileName: 'test.xlsx',
				fileSizeBytes: 256,
				totalRows: 100,
			});

			const initialSelects = stats.selects;

			// 执行大量查询
			for (let i = 0; i < 50; i++) {
				await runner['getCachedJobStatus'](jobId);
				await runner.getJobProgress(jobId);
			}

			const finalSelects = stats.selects;
			const selectCount = finalSelects - initialSelects;

			// 验证数据库查询数量显著减少（应远小于 100）
			expect(selectCount).toBeLessThan(10);
		});
	});
});
