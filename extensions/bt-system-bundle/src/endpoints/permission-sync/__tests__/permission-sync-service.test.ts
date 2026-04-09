import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionSyncService } from '../permission-sync-service';
import { PermissionTemplate } from '../types';

function createDatabaseMock(existingPermissions: any[] = []) {
	const queryBuilder = {
		from: vi.fn().mockReturnThis(),
		leftJoin: vi.fn().mockReturnThis(),
		whereIn: vi.fn(),
	};

	queryBuilder.whereIn
		.mockReturnValueOnce(queryBuilder)
		.mockResolvedValueOnce(existingPermissions);

	return {
		select: vi.fn().mockReturnValue(queryBuilder),
	};
}

describe('PermissionSyncService', () => {
	let database: ReturnType<typeof createDatabaseMock>;
	let service: PermissionSyncService;

	beforeEach(() => {
		database = createDatabaseMock();
		service = new PermissionSyncService(database as any);
	});

	it('应该使用 role_id 生成 Directus 权限配置', async () => {
		const preview = await service.previewPermissions({
			user_library_permissions: [
				{
					user_id: '7',
					role_id: '12',
					library_id: 'library-a',
					template: PermissionTemplate.READER_READ,
					enabled: true,
				},
			],
			collections: ['ds-descriptors'],
		});

		expect(preview.permissions_to_create).toHaveLength(1);
		expect(preview.permissions_to_create[0]).toMatchObject({
			role: '12',
			collection: 'ds-descriptors',
			action: 'read',
		});
	});

	it('应该在缺少 role_id 时拒绝启用的权限同步', async () => {
		await expect(
			service.previewPermissions({
				user_library_permissions: [
					{
						user_id: '7',
						library_id: 'library-a',
						template: PermissionTemplate.READER_READ,
						enabled: true,
					},
				],
				collections: ['ds-descriptors'],
			})
		).rejects.toThrow('Missing role_id');
	});
});
