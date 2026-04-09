/**
 * 简化的批量插入性能验证
 * 直接测试 processBatch 方法的性能改进
 */

import { bench, describe } from 'vitest';
import { Knex } from 'knex';
import { ImportJobRunner, BatchDataItem } from '../services/import-job-runner';

type MockRow = Record<string, any>;
type MockDatabase = Record<string, MockRow[]>;

function createSimpleMock(database: MockDatabase, table: string) {
	return {
		insert(data: MockRow | MockRow[]) {
			const rows = Array.isArray(data) ? data : [data];
			rows.forEach((row) => {
				const nextRow = row.id ? { ...row } : { id: (database[table]?.length || 0) + 1, ...row };
				database[table].push(nextRow);
			});
			return Promise.resolve(rows.map(() => ({ id: 1 })));
		},
	};
}

function createSimpleRunner() {
	const database: MockDatabase = {
		test_collection: [],
	};

	const knex = ((table: string) => createSimpleMock(database, table)) as unknown as Knex;
	(knex as any).transaction = async (callback: (trx: Knex) => Promise<void>) => callback(knex);

	const runner = new ImportJobRunner(knex);
	return { runner, database };
}

function generateTestData(count: number): BatchDataItem[] {
	return Array.from({ length: count }, (_, i) => ({
		row_number: i + 1,
		sheet_name: 'Sheet1',
		data: {
			name: `Test ${i}`,
			value: Math.random() * 1000,
		},
	}));
}

describe('批量插入性能验证', () => {
	const { runner } = createSimpleRunner();

	bench('批量插入 1000 条数据', async () => {
		const data = generateTestData(1000);
		// 直接调用 processBatch 方法
		await (runner as any).processBatch(1, data, 'test_collection', 'Sheet1');
	});

	bench('批量插入 5000 条数据', async () => {
		const data = generateTestData(5000);
		await (runner as any).processBatch(2, data, 'test_collection', 'Sheet1');
	});

	bench('批量插入 10000 条数据', async () => {
		const data = generateTestData(10000);
		await (runner as any).processBatch(3, data, 'test_collection', 'Sheet1');
	});
});
