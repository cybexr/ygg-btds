import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegistryService } from '../registry-service';

describe('RegistryService JSON 容错', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('在字段 schema JSON 损坏时返回空数组并记录警告', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const row = {
			id: 1,
			collection_name: 'bt_invalid_schema',
			display_name: '损坏 Schema',
			status: 'draft',
			source_file_name: null,
			record_count: 0,
			field_schema_json: '{"broken":',
			last_import_job_id: null,
			created_user_id: 1,
			updated_user_id: 1,
			created_at: new Date(),
			updated_at: new Date(),
			description: null,
			tags: '["tag-a"]',
		};
		const database = vi.fn(() => ({
			where: vi.fn(() => ({
				first: vi.fn().mockResolvedValue(row),
			})),
		})) as any;
		const service = new RegistryService(database);

		const dataset = await service.getDatasetById(1);

		expect(dataset).not.toBeNull();
		expect(dataset?.field_schema_json).toEqual([]);
		expect(dataset?.tags).toEqual(['tag-a']);
		expect(warnSpy).toHaveBeenCalledWith(
			'[RegistryService] Failed to parse field_schema_json, using fallback value.',
			expect.any(SyntaxError)
		);
	});

	it('在标签 JSON 损坏时返回空数组并记录警告', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const row = {
			id: 2,
			collection_name: 'bt_invalid_tags',
			display_name: '损坏 Tags',
			status: 'draft',
			source_file_name: null,
			record_count: 0,
			field_schema_json: '[]',
			last_import_job_id: null,
			created_user_id: 1,
			updated_user_id: 1,
			created_at: new Date(),
			updated_at: new Date(),
			description: null,
			tags: '{"broken":',
		};
		const database = vi.fn(() => ({
			where: vi.fn(() => ({
				first: vi.fn().mockResolvedValue(row),
			})),
		})) as any;
		const service = new RegistryService(database);

		const dataset = await service.getDatasetById(2);

		expect(dataset).not.toBeNull();
		expect(dataset?.field_schema_json).toEqual([]);
		expect(dataset?.tags).toEqual([]);
		expect(warnSpy).toHaveBeenCalledWith(
			'[RegistryService] Failed to parse tags, using fallback value.',
			expect.any(SyntaxError)
		);
	});
});
