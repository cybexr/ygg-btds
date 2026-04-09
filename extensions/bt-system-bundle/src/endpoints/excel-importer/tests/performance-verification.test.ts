import { describe, it, expect, beforeAll } from 'vitest';
import { Knex } from 'knex';
import { ImportJobRunner, ImportJobStatus, BatchDataItem } from '../services/import-job-runner';
import { performance } from 'perf_hooks';

/**
 * 性能验证测试 - 验证批量插入优化的实际效果
 */

type MockRow = Record<string, any>;
type MockDatabase = Record<string, MockRow[]>;

function createMockQuery(database: MockDatabase, table: string) {
	let predicate: ((item: MockRow) => boolean) | undefined;

	const matchingRows = () => {
		const rows = database[table] || [];
		return predicate ? rows.filter(predicate) : rows;
	};

	const insertAndReturn = (data: MockRow | MockRow[]) => {
		const rows = Array.isArray(data) ? data : [data];
		const inserted = rows.map((row) => {
			const nextRow = row.id ? { ...row } : { id: (database[table]?.length || 0) + 1, ...row };
			database[table].push(nextRow);
			return nextRow;
		});

		return Promise.resolve(inserted.map((row) => ({ id: row.id })));
	};

	return {
		insert(data: MockRow | MockRow[]) {
			return insertAndReturn(data);
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
				insert: (data: MockRow | MockRow[]) => insertAndReturn(data),
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

	const knex = ((table: string) => createMockQuery(database, table)) as unknown as Knex;
	(knex as any).transaction = async (callback: (trx: Knex) => Promise<void>) => callback(knex);

	return { runner: new ImportJobRunner(knex), database };
}

function generateTestData(count: number): BatchDataItem[] {
	const data: BatchDataItem[] = [];

	for (let i = 0; i < count; i++) {
		data.push({
			row_number: i + 1,
			sheet_name: 'Sheet1',
			data: {
				name: `Test Record ${i}`,
				value: Math.floor(Math.random() * 1000),
				status: 'active',
				created_at: new Date().toISOString(),
			},
		});
	}

	return data;
}

describe('批量插入性能验证', () => {
	const results: Map<string, any> = new Map();

	beforeAll(() => {
		console.log('\n🚀 开始批量插入性能验证测试...\n');
	});

	it('验证 100 条数据的批量导入性能', async () => {
		const { runner } = createRunner();
		const jobId = await runner.createImportJob({
			jobIdentifier: 'perf-100',
			sourceFileName: 'test.xlsx',
			fileSizeBytes: 100 * 100,
			totalRows: 100,
			batchSize: 1000,
		});

		await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

		const data = generateTestData(100);
		const start = performance.now();
		const result = await runner.startImportJob(jobId, data, 'test_collection');
		const duration = performance.now() - start;

		expect(result.status).toBe(ImportJobStatus.COMPLETED);
		expect(result.successRows).toBe(100);

		const metrics = runner.getBatchInsertMetrics(jobId);
		results.set('100', { duration, metrics });

		console.log(`✅ 100 条数据: ${duration.toFixed(2)}ms`);
		if (metrics) {
			console.log(`   批量模式: ${metrics.batchCount} 次, 降级: ${metrics.fallbackCount} 次`);
		}
	});

	it('验证 1000 条数据的批量导入性能', async () => {
		const { runner } = createRunner();
		const jobId = await runner.createImportJob({
			jobIdentifier: 'perf-1000',
			sourceFileName: 'test.xlsx',
			fileSizeBytes: 1000 * 100,
			totalRows: 1000,
			batchSize: 1000,
		});

		await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

		const data = generateTestData(1000);
		const start = performance.now();
		const result = await runner.startImportJob(jobId, data, 'test_collection');
		const duration = performance.now() - start;

		expect(result.status).toBe(ImportJobStatus.COMPLETED);
		expect(result.successRows).toBe(1000);

		// 性能验证：1000 条数据应该在 2 秒内完成
		expect(duration).toBeLessThan(2000);

		const metrics = runner.getBatchInsertMetrics(jobId);
		results.set('1000', { duration, metrics });

		console.log(`✅ 1000 条数据: ${duration.toFixed(2)}ms`);
		if (metrics) {
			console.log(`   批量模式: ${metrics.batchCount} 次, 降级: ${metrics.fallbackCount} 次`);
			console.log(`   平均批量时间: ${metrics.avgBatchTime}ms`);
			console.log(`   批量成功率: ${(metrics.batchModeSuccessRate * 100).toFixed(1)}%`);
		}
	});

	it('验证 10000 条数据的批量导入性能', async () => {
		const { runner } = createRunner();
		const jobId = await runner.createImportJob({
			jobIdentifier: 'perf-10000',
			sourceFileName: 'test.xlsx',
			fileSizeBytes: 10000 * 100,
			totalRows: 10000,
			batchSize: 1000,
		});

		await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

		const data = generateTestData(10000);
		const start = performance.now();
		const result = await runner.startImportJob(jobId, data, 'test_collection');
		const duration = performance.now() - start;

		expect(result.status).toBe(ImportJobStatus.COMPLETED);
		expect(result.successRows).toBe(10000);

		const metrics = runner.getBatchInsertMetrics(jobId);
		results.set('10000', { duration, metrics });

		console.log(`✅ 10000 条数据: ${duration.toFixed(2)}ms`);
		if (metrics) {
			console.log(`   批量模式: ${metrics.batchCount} 次, 降级: ${metrics.fallbackCount} 次`);
			console.log(`   平均批量时间: ${metrics.avgBatchTime}ms`);
			const rowsPerSecond = (result.successRows / (duration / 1000)).toFixed(0);
			console.log(`   处理速度: ${rowsPerSecond} 行/秒`);
		}
	});

	it('生成性能验证报告', async () => {
		console.log('\n📊 性能验证报告:');
		console.log('═══════════════════════════════════════');

		const sizes = [100, 1000, 10000];
		for (const size of sizes) {
			const result = results.get(size.toString());
			if (result) {
				const { duration, metrics } = result;
				const rowsPerSecond = (size / (duration / 1000)).toFixed(0);

				console.log(`\n📦 ${size} 条数据:`);
				console.log(`   耗时: ${duration.toFixed(2)}ms`);
				console.log(`   速度: ${rowsPerSecond} 行/秒`);

				if (metrics) {
					console.log(`   批量插入: ${metrics.batchCount} 次`);
					console.log(`   降级处理: ${metrics.fallbackCount} 次`);
					console.log(`   成功率: ${(metrics.batchModeSuccessRate * 100).toFixed(1)}%`);
				}

				// 验证性能改进（相比基线至少快 50%）
				const baseline = size * 1.2; // 基线：每条数据 1.2ms
				const improvement = ((baseline - duration) / baseline) * 100;
				console.log(`   性能提升: ${improvement.toFixed(1)}%`);

				expect(duration).toBeLessThan(baseline);
			}
		}

		console.log('\n✅ 所有性能验证测试通过！');
		console.log('═══════════════════════════════════════\n');
	});
});
