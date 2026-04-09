import { bench, describe, expect, beforeAll } from 'vitest';
import { Knex } from 'knex';
import { ImportJobRunner, ImportJobStatus, BatchDataItem } from '../services/import-job-runner';
import { performance } from 'perf_hooks';

/**
 * 批量导入性能基准测试
 *
 * 目标验证优化效果：
 * - 批量插入相比循环插入的性能提升
 * - 不同数据量级的导入性能
 * - 批量插入失败时的降级处理性能
 */

type MockRow = Record<string, any>;
type MockDatabase = Record<string, MockRow[]>;

interface PerformanceStats {
	insertCount: number;
	transactionCount: number;
	batchInsertCount: number;
	fallbackInsertCount: number;
	totalRowsInserted: number;
}

function createMockQuery(
	database: MockDatabase,
	table: string,
	stats: PerformanceStats
) {
	let predicate: ((item: MockRow) => boolean) | undefined;

	const matchingRows = () => {
		const rows = database[table] || [];
		return predicate ? rows.filter(predicate) : rows;
	};

	return {
		insert(data: MockRow | MockRow[]) {
			const rows = Array.isArray(data) ? data : [data];
			stats.insertCount++;
			stats.totalRowsInserted += rows.length;

			if (Array.isArray(data) && data.length > 1) {
				stats.batchInsertCount++;
			} else {
				stats.fallbackInsertCount += rows.length;
			}

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
		bt_performance_test: [],
	};

	const stats: PerformanceStats = {
		insertCount: 0,
		transactionCount: 0,
		batchInsertCount: 0,
		fallbackInsertCount: 0,
		totalRowsInserted: 0,
	};

	const knex = ((table: string) => createMockQuery(database, table, stats)) as unknown as Knex;
	(knex as any).transaction = async (callback: (trx: Knex) => Promise<void>) => {
		stats.transactionCount++;
		return callback(knex);
	};

	return { runner: new ImportJobRunner(knex), database, stats };
}

function generateTestData(count: number, includeErrors = false): BatchDataItem[] {
	const data: BatchDataItem[] = [];

	for (let i = 0; i < count; i++) {
		const shouldFail = includeErrors && i % 100 === 0; // 每100条包含一个错误

		data.push({
			row_number: i + 1,
			sheet_name: 'Sheet1',
			data: {
				name: `Test Record ${i}`,
				value: Math.floor(Math.random() * 1000),
				status: shouldFail ? null : 'active', // 模拟 NOT NULL 约束违反
				created_at: new Date().toISOString(),
			},
		});
	}

	return data;
}

describe('ImportJobRunner batch insert performance', () => {
	const baselineResults: Map<number, number> = new Map();

	beforeAll(async () => {
		// 建立性能基线 - 模拟优化前的循环插入性能
		console.log('\n📊 建立性能基线...');

		const sizes = [100, 1000, 10000];
		for (const size of sizes) {
			const { runner, stats } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: `baseline-${size}`,
				sourceFileName: 'baseline.xlsx',
				fileSizeBytes: size * 100,
				totalRows: size,
			});

			await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

			const data = generateTestData(size);
			const start = performance.now();

			// 模拟优化前的循环插入（逐条插入）
			for (const item of data) {
				try {
					await (runner as any).database('test_collection').insert(item.data);
				} catch (error) {
					// 忽略错误
				}
			}

			const duration = performance.now() - start;
			baselineResults.set(size, duration);
			console.log(`   基线 ${size} 条: ${duration.toFixed(2)}ms`);
		}
	});

	describe('批量插入性能测试', () => {
		const testSizes = [100, 1000, 10000, 100000];

		testSizes.forEach((size) => {
			bench(`批量导入 ${size} 条数据`, async () => {
				const { runner, stats } = createRunner();
				const jobId = await runner.createImportJob({
					jobIdentifier: `batch-${size}`,
					sourceFileName: 'batch.xlsx',
					fileSizeBytes: size * 100,
					totalRows: size,
					batchSize: 1000,
				});

				await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

				const data = generateTestData(size);
				const result = await runner.startImportJob(jobId, data, 'test_collection');

				// 验证结果
				expect(result.status).toBe(ImportJobStatus.COMPLETED);
				expect(result.successRows).toBe(size);
				expect(result.failedRows).toBe(0);

				// 验证批量插入被使用
				expect(stats.batchInsertCount).toBeGreaterThan(0);

				// 记录性能指标
				const baseline = baselineResults.get(size);
				if (baseline) {
					const improvement = ((baseline - result.duration) / baseline) * 100;
					console.log(
						`   📈 ${size} 条数据: ${result.duration}ms (优化前: ${baseline.toFixed(2)}ms, 提升: ${improvement.toFixed(1)}%)`
					);
				}

				// 获取批量插入指标
				const batchMetrics = runner.getBatchInsertMetrics(jobId);
				if (batchMetrics) {
					console.log(
						`   📊 批量模式: ${batchMetrics.batchCount} 次, 降级模式: ${batchMetrics.fallbackCount} 次, 成功率: ${(batchMetrics.batchModeSuccessRate * 100).toFixed(1)}%`
					);
				}
			});
		});
	});

	describe('混合数据批量导入测试', () => {
		bench('批量导入包含错误的数据 (1000条, 10个错误)', async () => {
			const { runner, stats } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'mixed-errors',
				sourceFileName: 'mixed.xlsx',
				fileSizeBytes: 1000 * 100,
				totalRows: 1000,
				batchSize: 1000,
			});

			await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

			const data = generateTestData(1000, true);
			const result = await runner.startImportJob(jobId, data, 'test_collection');

			// 验证结果
			expect(result.status).toBe(ImportJobStatus.COMPLETED);
			expect(result.successRows).toBeGreaterThan(900);
			expect(result.failedRows).toBeGreaterThan(0);

			// 验证错误被正确记录
			expect(result.errors.length).toBe(result.failedRows);

			// 验证降级模式被使用
			expect(stats.fallbackInsertCount).toBeGreaterThan(0);

			console.log(
				`   ⚠️  混合数据: 成功 ${result.successRows}, 失败 ${result.failedRows}, 耗时 ${result.duration}ms`
			);
		});
	});

	describe('不同批次大小性能对比', () => {
		const batchSizes = [100, 500, 1000, 2000, 5000];

		batchSizes.forEach((batchSize) => {
			bench(`批次大小 ${batchSize} 的导入性能`, async () => {
				const { runner } = createRunner();
				const jobId = await runner.createImportJob({
					jobIdentifier: `batch-size-${batchSize}`,
					sourceFileName: `batch-size-${batchSize}.xlsx`,
					fileSizeBytes: 10000 * 100,
					totalRows: 10000,
					batchSize,
				});

				await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

				const data = generateTestData(10000);
				const result = await runner.startImportJob(jobId, data, 'test_collection');

				expect(result.status).toBe(ImportJobStatus.COMPLETED);

				// 获取批量插入指标
				const batchMetrics = runner.getBatchInsertMetrics(jobId);
				if (batchMetrics) {
					const avgTimePerBatch = batchMetrics.avgBatchTime;
					console.log(
						`   📊 批次大小 ${batchSize}: 平均每批 ${avgTimePerBatch}ms, 共 ${batchMetrics.batchCount} 批`
					);
				}
			});
		});
	});

	describe('性能回归检测', () => {
		bench('1000条数据导入性能回归检测', async () => {
			const { runner } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'regression-test',
				sourceFileName: 'regression.xlsx',
				fileSizeBytes: 1000 * 100,
				totalRows: 1000,
				batchSize: 1000,
			});

			await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

			const data = generateTestData(1000);
			const result = await runner.startImportJob(jobId, data, 'test_collection');

			// 性能阈值：1000条数据应该在2秒内完成
			const performanceThreshold = 2000;
			expect(result.duration).toBeLessThan(performanceThreshold);

			// 验证相比基线有显著提升（至少50%）
			const baseline = baselineResults.get(1000);
			if (baseline) {
				const expectedDuration = baseline * 0.5; // 预期至少快50%
				expect(result.duration).toBeLessThan(expectedDuration);
			}

			console.log(`   ✅ 性能回归检测通过: ${result.duration}ms < ${performanceThreshold}ms`);
		});
	});

	describe('大规模数据导入压力测试', () => {
		bench('大规模数据导入 100000 条', async () => {
			const { runner } = createRunner();
			const jobId = await runner.createImportJob({
				jobIdentifier: 'large-scale',
				sourceFileName: 'large.xlsx',
				fileSizeBytes: 100000 * 100,
				totalRows: 100000,
				batchSize: 1000,
			});

			await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

			const data = generateTestData(100000);
			const result = await runner.startImportJob(jobId, data, 'test_collection');

			expect(result.status).toBe(ImportJobStatus.COMPLETED);
			expect(result.successRows).toBe(100000);

			// 大规模数据导入应该在合理时间内完成
			const largeScaleThreshold = 30000; // 30秒
			expect(result.duration).toBeLessThan(largeScaleThreshold);

			// 计算每秒处理行数
			const rowsPerSecond = (result.successRows / (result.duration / 1000)).toFixed(0);
			console.log(
				`   🚀 大规模导入: ${result.duration}ms (${rowsPerSecond} 行/秒)`
			);
		});
	});
});

describe('ImportJobRunner 性能基准报告', () => {
	bench('生成性能基准报告', async () => {
		const { runner } = createRunner();
		const jobId = await runner.createImportJob({
			jobIdentifier: 'benchmark-report',
			sourceFileName: 'benchmark.xlsx',
			fileSizeBytes: 5000 * 100,
			totalRows: 5000,
			batchSize: 1000,
		});

		await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

		const data = generateTestData(5000);
		const result = await runner.startImportJob(jobId, data, 'test_collection');

		// 收集所有性能指标
		const batchMetrics = runner.getBatchInsertMetrics(jobId);
		const perfMetrics = runner.getPerformanceMetrics(jobId);
		const cacheMetrics = runner.getCacheMetrics(jobId);

		console.log('\n📊 性能基准报告:');
		console.log(`   总耗时: ${result.duration}ms`);
		console.log(`   处理行数: ${result.successRows} 成功, ${result.failedRows} 失败`);
		console.log(`   平均速度: ${(result.successRows / (result.duration / 1000)).toFixed(0)} 行/秒`);

		if (batchMetrics) {
			console.log(`\n📦 批量插入指标:`);
			console.log(`   批量模式: ${batchMetrics.batchCount} 次`);
			console.log(`   降级模式: ${batchMetrics.fallbackCount} 次`);
			console.log(`   平均批量时间: ${batchMetrics.avgBatchTime}ms`);
			console.log(`   平均降级时间: ${batchMetrics.avgFallbackTime}ms`);
			console.log(`   批量模式成功率: ${(batchMetrics.batchModeSuccessRate * 100).toFixed(1)}%`);
		}

		if (perfMetrics) {
			console.log(`\n⚡ 性能指标:`);
			console.log(`   总耗时: ${perfMetrics.totalDuration}ms`);
			console.log(`   平均批次时间: ${perfMetrics.averageBatchTime}ms`);
		}

		if (cacheMetrics) {
			console.log(`\n💾 缓存指标:`);
			console.log(`   缓存命中率: ${(cacheMetrics.hitRate * 100).toFixed(1)}%`);
			console.log(`   缓存命中: ${cacheMetrics.hits} 次`);
			console.log(`   缓存未命中: ${cacheMetrics.misses} 次`);
			console.log(`   平均查找时间: ${cacheMetrics.averageLookupTime}ms`);
		}

		expect(result.status).toBe(ImportJobStatus.COMPLETED);
	});
});
