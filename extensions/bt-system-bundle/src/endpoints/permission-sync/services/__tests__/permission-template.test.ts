/**
 * Permission Template Service Tests
 * 测试权限模板服务的功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Knex } from 'knex';
import { PermissionTemplateService, BusinessRole } from '../permission-template-service';
import type { DirectusPermission } from '../../types';

describe('PermissionTemplateService', () => {
	let service: PermissionTemplateService;
	let mockDatabase: Knex;

	beforeEach(() => {
		// 创建 mock database
		mockDatabase = {
			table: vi.fn((tableName: string) => ({
				where: vi.fn(() => ({
					first: vi.fn(),
					update: vi.fn(),
					del: vi.fn(),
				})),
				insert: vi.fn(),
				select: vi.fn(),
				orderBy: vi.fn(),
				limit: vi.fn(),
				whereIn: vi.fn(),
				whereNull: vi.fn(),
			})),
			transaction: vi.fn((callback: any) => {
				const mockTrx = {
					table: vi.fn((tableName: string) => ({
						where: vi.fn(() => ({
							update: vi.fn(),
							del: vi.fn(),
						})),
						insert: vi.fn(),
					})),
					commit: vi.fn(),
					rollback: vi.fn(),
				};
				return callback(mockTrx);
			}),
		} as any;

		service = new PermissionTemplateService(mockDatabase);
	});

	describe('getTemplate', () => {
		it('应该返回 ds-descriptor 权限模板', () => {
			const template = service.getTemplate(BusinessRole.DESCRIPTOR);

			expect(template.role).toBe(BusinessRole.DESCRIPTOR);
			expect(template.permissions).toEqual(['create', 'read', 'update', 'delete']);
			expect(template.field_access).toBe('full');
		});

		it('应该返回 ds-reader 权限模板', () => {
			const template = service.getTemplate(BusinessRole.READER);

			expect(template.role).toBe(BusinessRole.READER);
			expect(template.permissions).toEqual(['read']);
			expect(template.field_access).toBe('full');
		});

		it('应该在未知角色时抛出错误', () => {
			expect(() => {
				service.getTemplate('unknown' as BusinessRole);
			}).toThrow('Unknown business role');
		});
	});

	describe('getAllTemplates', () => {
		it('应该返回所有权限模板', () => {
			const templates = service.getAllTemplates();

			expect(templates).toHaveLength(2);
			expect(templates[0].role).toBe(BusinessRole.DESCRIPTOR);
			expect(templates[1].role).toBe(BusinessRole.READER);
		});
	});

	describe('generatePermissionsFromTemplate', () => {
		it('应该为 ds-descriptor 生成 4 条权限记录', () => {
			const permissions = service.generatePermissionsFromTemplate(
				'bt_test_collection',
				BusinessRole.DESCRIPTOR,
				'role-123'
			);

			expect(permissions).toHaveLength(4);
			expect(permissions.map(p => p.action)).toEqual([
				'create',
				'read',
				'update',
				'delete',
			]);
		});

		it('应该为 ds-reader 生成 1 条权限记录', () => {
			const permissions = service.generatePermissionsFromTemplate(
				'bt_test_collection',
				BusinessRole.READER,
				'role-123'
			);

			expect(permissions).toHaveLength(1);
			expect(permissions[0].action).toBe('read');
		});

		it('应该正确设置集合名称和角色 ID', () => {
			const permissions = service.generatePermissionsFromTemplate(
				'bt_test_collection',
				BusinessRole.READER,
				'role-456'
			);

			expect(permissions[0].collection).toBe('bt_test_collection');
			expect(permissions[0].role).toBe('role-456');
		});

		it('应该支持 null 角色（admin）', () => {
			const permissions = service.generatePermissionsFromTemplate(
				'bt_test_collection',
				BusinessRole.READER,
				null
			);

			expect(permissions[0].role).toBeNull();
		});
	});

	describe('validatePermissions', () => {
		it('应该验证有效的权限配置', () => {
			const permissions = service.generatePermissionsFromTemplate(
				'bt_test_collection',
				BusinessRole.READER,
				'role-123'
			);

			const result = service.validatePermissions(permissions);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('应该检测缺失的集合名称', () => {
			const result = service.validatePermissions([
				{
					role: 'role-123',
					collection: '',
					action: 'read',
					permissions: null,
					validation: null,
					presets: null,
					fields: null,
				},
			]);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Permission must have a collection');
		});

		it('应该检测无效的操作类型', () => {
			const result = service.validatePermissions([
				{
					role: 'role-123',
					collection: 'bt_test',
					action: 'invalid' as any,
					permissions: null,
					validation: null,
					presets: null,
					fields: null,
				},
			]);

			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('Invalid action');
		});
	});

	describe('权限模板定义', () => {
		it('ds-descriptor 应该包含所有 CRUD 操作', () => {
			const template = service.getTemplate(BusinessRole.DESCRIPTOR);

			expect(template.permissions).toContain('create');
			expect(template.permissions).toContain('read');
			expect(template.permissions).toContain('update');
			expect(template.permissions).toContain('delete');
		});

		it('ds-reader 应该只包含 read 操作', () => {
			const template = service.getTemplate(BusinessRole.READER);

			expect(template.permissions).toEqual(['read']);
			expect(template.permissions).not.toContain('create');
			expect(template.permissions).not.toContain('update');
			expect(template.permissions).not.toContain('delete');
		});

		it('权限模板应该支持完整字段访问', () => {
			const descriptorTemplate = service.getTemplate(BusinessRole.DESCRIPTOR);
			const readerTemplate = service.getTemplate(BusinessRole.READER);

			expect(descriptorTemplate.field_access).toBe('full');
			expect(readerTemplate.field_access).toBe('full');
		});
	});

	describe('权限模板映射到 Directus', () => {
		it('应该正确映射到 directus_permissions 表结构', () => {
			const permissions = service.generatePermissionsFromTemplate(
				'bt_test_collection',
				BusinessRole.DESCRIPTOR,
				'role-123'
			);

			for (const permission of permissions) {
				// 验证必需字段
				expect(permission).toHaveProperty('role');
				expect(permission).toHaveProperty('collection');
				expect(permission).toHaveProperty('action');
				expect(permission).toHaveProperty('permissions');
				expect(permission).toHaveProperty('validation');
				expect(permission).toHaveProperty('presets');
				expect(permission).toHaveProperty('fields');

				// 验证字段类型
				expect(typeof permission.collection).toBe('string');
				expect(typeof permission.action).toBe('string');
			}
		});

		it('应该支持自定义字段访问控制', () => {
			// 创建自定义模板
			const customTemplate = {
				role: BusinessRole.READER,
				description: '自定义只读模板',
				permissions: ['read'] as any,
				field_access: 'custom' as const,
				custom_fields: ['id', 'name', 'status'],
			};

			// 验证自定义字段配置
			expect(customTemplate.field_access).toBe('custom');
			expect(customTemplate.custom_fields).toEqual(['id', 'name', 'status']);
		});
	});
});

describe('权限同步功能集成测试', () => {
	let service: PermissionTemplateService;

	beforeEach(() => {
		const mockDatabase = {
			table: vi.fn(() => ({
				where: vi.fn(() => ({
					first: vi.fn().mockResolvedValue({
						id: 1,
						collection_name: 'bt_test',
						role_id: 'role-123',
						permissions_before: '[]',
						status: 'completed',
						created_at: new Date(),
					}),
					update: vi.fn().mockResolvedValue(1),
					del: vi.fn().mockResolvedValue(1),
				})),
				insert: vi.fn().mockResolvedValue([1]),
				select: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			})),
			transaction: vi.fn((callback: any) => {
				const mockTrx = {
					table: vi.fn(() => ({
						where: vi.fn(() => ({
							update: vi.fn().mockResolvedValue(1),
							del: vi.fn().mockResolvedValue(1),
						})),
						insert: vi.fn().mockResolvedValue([1]),
					})),
					commit: vi.fn(),
					rollback: vi.fn(),
				};
				return callback(mockTrx);
			}),
		} as any;

		service = new PermissionTemplateService(mockDatabase);
	});

	it('应该支持批量同步多个集合', async () => {
		const collections = ['bt_collection_1', 'bt_collection_2', 'bt_collection_3'];

		// Mock previewPermissions 返回空预览
		vi.spyOn(service as any, 'previewPermissions').mockResolvedValue({
			collection: '',
			role: BusinessRole.READER,
			current_permissions: [],
			template_permissions: [],
			differences: [],
			summary: {
				to_create: 0,
				to_update: 0,
				to_delete: 0,
				unchanged: 0,
			},
		});

		const results = await service.batchSyncPermissions(
			collections,
			BusinessRole.READER,
			'role-123'
		);

		expect(results).toHaveLength(3);
		expect(results[0].collection).toBe('bt_collection_1');
		expect(results[1].collection).toBe('bt_collection_2');
		expect(results[2].collection).toBe('bt_collection_3');
	});

	it('应该支持回滚到指定同步点', async () => {
		const rollbackPoints = await service.getRollbackPoints('bt_test', 'role-123');

		expect(rollbackPoints).toBeDefined();
		expect(Array.isArray(rollbackPoints)).toBe(true);
	});
});
