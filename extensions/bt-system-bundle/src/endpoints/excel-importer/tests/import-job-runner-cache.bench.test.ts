import { bench, describe, expect } from 'vitest';
import { Knex } from 'knex';
import { ImportJobRunner, ImportJobStatus } from '../services/import-job-runner';

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

			const promise = Promise.resolve(inserted.map((row) => ({ id: row.id }))) as any;
			promise.returning = () => promise;
			return promise;
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

describe('ImportJobRunner cache benchmark', async () => {
	const { runner, stats } = createRunner();
	const jobId = await runner.createImportJob({
		jobIdentifier: 'cache-bench-job',
		sourceFileName: 'bench.xlsx',
		fileSizeBytes: 256,
		totalRows: 100,
	});
	await runner['updateJobStatus'](jobId, ImportJobStatus.RUNNING);

	bench('cached status lookups', async () => {
		await runner['getCachedJobStatus'](jobId, true);
		for (let i = 0; i < 25; i++) {
			await runner['getCachedJobStatus'](jobId);
		}

		const metrics = runner.getCacheMetrics(jobId);
		expect(metrics?.hits).toBeGreaterThan(20);
		expect(stats.selects).toBeLessThanOrEqual(2);
	});
});
