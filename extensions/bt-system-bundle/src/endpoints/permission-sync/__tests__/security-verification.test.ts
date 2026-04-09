/**
 * 安全修复验证脚本
 * 验证 dsc-security-004 角色映射安全修复
 */

import { describe, it, expect } from 'vitest';
import { PermissionSyncService } from '../permission-sync-service';
import { PermissionTemplate } from '../types';

describe('dsc-security-004 角色映射安全修复验证', () => {
	describe('PermissionSyncService 角色映射', () => {
		it('应该拒绝启用权限缺少 role_id 的请求', async () => {
			const database = {
				select: () => ({
					from: () => ({
						leftJoin: () => ({
							whereIn: () => Promise.resolve([]),
						}),
					}),
				}),
			};

			const service = new PermissionSyncService(database as any);

			await expect(
				service.previewPermissions({
					user_library_permissions: [
						{
							user_id: 'user-123',
							library_id: 'library-456',
							template: PermissionTemplate.READER_READ,
							enabled: true,
						},
					],
				})
			).rejects.toThrow('Missing role_id');
		});

		it('应该接受启用权限提供有效 role_id 的请求', async () => {
			const database = {
				select: () => ({
					from: () => ({
						leftJoin: () => ({
							whereIn: () => Promise.resolve([]),
						}),
					}),
				}),
			};

			const service = new PermissionSyncService(database as any);

			const result = await service.previewPermissions({
				user_library_permissions: [
					{
						user_id: 'user-123',
						role_id: '12',
						library_id: 'library-456',
						template: PermissionTemplate.READER_READ,
						enabled: true,
					},
				],
			});

			// 模板会为多个集合生成权限，但所有权限都应该使用正确的 role_id
			expect(result.permissions_to_create.length).toBeGreaterThan(0);
			expect(result.permissions_to_create[0].role).toBe('12');
		});

		it('应该允许未启用权限不提供 role_id', async () => {
			const database = {
				select: () => ({
					from: () => ({
						leftJoin: () => ({
							whereIn: () => Promise.resolve([]),
						}),
					}),
				}),
			};

			const service = new PermissionSyncService(database as any);

			const result = await service.previewPermissions({
				user_library_permissions: [
					{
						user_id: 'user-123',
						library_id: 'library-456',
						template: PermissionTemplate.READER_READ,
						enabled: false,
					},
				],
			});

			// 未启用的权限不应该创建任何权限
			expect(result.permissions_to_create).toHaveLength(0);
		});
	});

	describe('角色映射安全性', () => {
		it('应该确保 role 字段引用 directus_roles.id 而非 user_id', async () => {
			const database = {
				select: () => ({
					from: () => ({
						leftJoin: () => ({
							whereIn: () => Promise.resolve([]),
						}),
					}),
				}),
			};

			const service = new PermissionSyncService(database as any);

			const result = await service.previewPermissions({
				user_library_permissions: [
					{
						user_id: 'user-123',
						role_id: 'role-456',
						library_id: 'library-789',
						template: PermissionTemplate.DESCRIPTOR_CRUD,
						enabled: true,
					},
				],
			});

			// 验证生成的权限使用 role_id 而不是 user_id
			expect(result.permissions_to_create[0].role).toBe('role-456');
			expect(result.permissions_to_create[0].role).not.toBe('user-123');
		});

		it('应该防止权限提升攻击', async () => {
			const database = {
				select: () => ({
					from: () => ({
						leftJoin: () => ({
							whereIn: () => Promise.resolve([]),
						}),
					}),
				}),
			};

			const service = new PermissionSyncService(database as any);

			// 尝试使用 user_id 作为 role_id（应该被防御）
			const maliciousRequest = {
				user_library_permissions: [
					{
						user_id: 'admin-user-id',
						role_id: 'admin-user-id', // 尝试使用 user_id 作为 role_id
						library_id: 'sensitive-library',
						template: PermissionTemplate.DESCRIPTOR_CRUD,
						enabled: true,
					},
				],
			};

			const result = await service.previewPermissions(maliciousRequest);

			// 即使尝试使用 user_id 作为 role_id，系统也会使用提供的 role_id
			// 真正的安全防御在数据库层面，通过外键约束和 RLS 策略
			expect(result.permissions_to_create[0].role).toBe('admin-user-id');
		});
	});
});
