/**
 * ImportJobRunner 单元测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';

import { ImportJobRunner } from '../import-job-runner';

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ImportJobRow = {
	id: number;
	job_identifier: string;
	source_file_name: string;
	file_size_bytes: number;
	status: string;
	total_rows: number;
	processed_rows: number;
	failed_rows: number;
	success_rows: number;
	import_options: string;
	batch_size: number;
	created_user_id?: number;
};

function createMockKnex(storage: ImportJobRow[]): Knex {
	return ((table: string) => {
		if (table !== 'bt_import_jobs') {
			throw new Error(`Unexpected table: ${table}`);
		}

		return {
			insert(data: Omit<ImportJobRow, 'id'>) {
				return {
					returning(_field: string) {
						const row = {
							id: storage.length + 1,
							...data,
						};
						storage.push(row);
						return Promise.resolve([{ id: row.id }]);
					},
				};
			},
		};
	}) as unknown as Knex;
}

describe('ImportJobRunner UUID generation', () => {
	let jobs: ImportJobRow[];
	let runner: ImportJobRunner;

	beforeEach(() => {
		jobs = [];
		runner = new ImportJobRunner(createMockKnex(jobs));
	});

	it('generates RFC 4122 UUID v4 when jobIdentifier is omitted', async () => {
		const jobId = await runner.createImportJob({
			sourceFileName: 'generated.xlsx',
			fileSizeBytes: 1024,
			totalRows: 10,
		});

		expect(jobId).toBe(1);
		expect(jobs[0]?.job_identifier).toMatch(uuidV4Pattern);
	});

	it('generates unique UUID values across multiple jobs', async () => {
		for (let index = 0; index < 1000; index += 1) {
			await runner.createImportJob({
				sourceFileName: `generated-${index}.xlsx`,
				fileSizeBytes: 1024,
				totalRows: 1,
			});
		}

		expect(new Set(jobs.map((job) => job.job_identifier)).size).toBe(1000);
	});

	it('preserves caller-provided jobIdentifier values', async () => {
		await runner.createImportJob({
			jobIdentifier: 'manual-job-id',
			sourceFileName: 'manual.xlsx',
			fileSizeBytes: 1024,
			totalRows: 1,
		});

		expect(jobs[0]?.job_identifier).toBe('manual-job-id');
	});
});
