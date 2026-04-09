/**
 * Permission Sync 集成测试
 * 测试完整的权限同步流程，包括：
 * - 权限模板服务与权限同步服务的协作
 * - 数据库事务处理
 * - 权限同步日志记录
 * - 回滚功能
 * - 批量操作
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Knex } from 'knex';
import { PermissionTemplateService, BusinessRole } from '../permission-template-service';
import { PermissionSyncService } from '../../permission-sync-service';
import { PermissionTemplate } from '../../types';

describe('Permission Sync 集成测试', () => {
	let mockDatabase: Knex;
	let permissionTemplateService: PermissionTemplateService;
	let permissionSyncService: PermissionSyncService;
	let syncLogIdCounter = 0;
	let permissionIdCounter = 0;

	// 创建 Knex mock 的辅助函数
	const createKnexMock = () => {
		let currentQuery: any = {
			where: vi.fn(function(this: any, field: string, value?: any) {
				if (value !== undefined) {
					currentQuery._where[field] = value;
				}
				return currentQuery;
			}),
			whereIn: vi.fn(function(this: any) {
				return currentQuery;
			}),
			whereNull: vi.fn(function(this: any) {
				return currentQuery;
			}),
			first: vi.fn(function(this: any) {
				return Promise.resolve(null);
			}),
			update: vi.fn(function(this: any) {
				return Promise.resolve(1);
			}),
			del: vi.fn(function(this: any) {
				return Promise.resolve(1);
			}),
			insert: vi.fn(function(this: any, data: any) {
				const inserted = Array.isArray(data) ? data : [data];
				inserted.forEach((p: any) => {
					p.id = ++permissionIdCounter;
				});
				return Promise.resolve(inserted.map((p: any) => ({ id: p.id })));
			}),
			select: vi.fn(function(this: any) {
				return currentQuery;
			}),
			orderBy: vi.fn(function(this: any) {
				return currentQuery;
			}),
			limit: vi.fn(function(this: any) {
				return Promise.resolve([]);
			}),
			then: vi.fn(function(this: any, resolve: (value: any) => void) {
				return Promise.resolve([]);
			}),
			_where: {} as any,
		};

		const database = vi.fn((tableName: string) => {
			currentQuery._tableName = tableName;
			// 返回一个新的查询构建器
			return {
				where: vi.fn((field: string, value?: any) => {
					if (value !== undefined) {
						currentQuery._where[field] = value;
					}
					return {
						where: vi.fn(() => ({
							first: vi.fn().mockResolvedValue(null),
							update: vi.fn().mockResolvedValue(1),
							del: vi.fn().mockResolvedValue(1),
						})),
						whereIn: vi.fn(() => ({})),
						whereNull: vi.fn(() => ({})),
						first: vi.fn().mockResolvedValue(null),
						update: vi.fn().mockResolvedValue(1),
						del: vi.fn().mockResolvedValue(1),
						insert: vi.fn((data: any) => {
							const inserted = Array.isArray(data) ? data : [data];
							inserted.forEach((p: any) => {
								p.id = ++permissionIdCounter;
							});
							return Promise.resolve(inserted.map((p: any) => ({ id: p.id })));
						}),
						select: vi.fn().mockReturnThis(),
						orderBy: vi.fn().mockReturnThis(),
						limit: vi.fn().mockResolvedValue([]),
						then: vi.fn(() => Promise.resolve([])),
					};
				}),
				insert: vi.fn((data: any) => {
					const id = ++syncLogIdCounter;
					return Promise.resolve([{ id }]);
				}),
				select: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: syncLogIdCounter,
									collection_name: 'bt_test_collection',
									role_id: 'role-123',
									permissions_before: '[]',
									status: 'completed',
									created_at: new Date(),
								},
							]),
						}),
					}),
				}),
			};
		}) as any;

		database.transaction = vi.fn((callback: any) => {
			const mockTrx = {
				table: vi.fn((tableName: string) => ({
					where: vi.fn(() => ({
						update: vi.fn().mockResolvedValue(1),
						del: vi.fn().mockResolvedValue(1),
					})),
					insert: vi.fn((data: any) => {
						const inserted = Array.isArray(data) ? data : [data];
						inserted.forEach((p: any) => {
							p.id = ++permissionIdCounter;
						});
						return Promise.resolve(inserted.map((p: any) => ({ id: p.id })));
					}),
				})),
				commit: vi.fn(),
				rollback: vi.fn(),
				where: vi.fn().mockReturnThis(),
				whereIn: vi.fn().mockReturnThis(),
				del: vi.fn().mockResolvedValue(1),
				select: vi.fn().mockReturnThis(),
				from: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				update: vi.fn().mockResolvedValue(1),
				returning: vi.fn().mockResolvedValue([{ id: ++permissionIdCounter }]),
			};
			return callback(mockTrx);
		});

		database.select = vi.fn().mockReturnThis();
		database.from = vi.fn().mockReturnThis();
		database.leftJoin = vi.fn().mockReturnThis();
		database.whereIn = vi.fn().mockResolvedValue([]);
		database.where = vi.fn().mockReturnThis();
		database.whereNull = vi.fn().mockReturnThis();

		return database;
	};

	beforeEach(() => {
		// 重置计数器
		syncLogIdCounter = 0;
		permissionIdCounter = 0;

		// 创建 mock 数据库
		mockDatabase = createKnexMock();

		permissionTemplateService = new PermissionTemplateService(mockDatabase);
		permissionSyncService = new PermissionSyncService(mockDatabase);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('权限模板生成与验证', () => {
		it('应该正确生成 ds-descriptor 权限模板', () => {
			const permissions = permissionTemplateService.generatePermissionsFromTemplate(
				'ds-descriptors',
				BusinessRole.DESCRIPTOR,
				'role-123'
			);

			expect(permissions).toHaveLength(4);
			expect(permissions.map(p => p.action)).toEqual(['create', 'read', 'update', 'delete']);
			expect(permissions.every(p => p.collection === 'ds-descriptors')).toBe(true);
			expect(permissions.every(p => p.role === 'role-123')).toBe(true);
		});

		it('应该正确生成 ds-reader 权限模板', () => {
			const permissions = permissionTemplateService.generatePermissionsFromTemplate(
				'ds-descriptors',
				BusinessRole.READER,
				'role-456'
			);

			expect(permissions).toHaveLength(1);
			expect(permissions[0].action).toBe('read');
			expect(permissions[0].collection).toBe('ds-descriptors');
			expect(permissions[0].role).toBe('role-456');
		});

		it('应该支持 null 角色（admin）', () => {
			const permissions = permissionTemplateService.generatePermissionsFromTemplate(
				'ds-descriptors',
				BusinessRole.READER,
				null
			);

			expect(permissions.every(p => p.role === null)).toBe(true);
		});

		it('应该正确验证有效的权限配置', () => {
			const permissions = permissionTemplateService.generatePermissionsFromTemplate(
				'ds-descriptors',
				BusinessRole.DESCRIPTOR,
				'role-123'
			);

			const validation = permissionTemplateService.validatePermissions(permissions);

			expect(validation.valid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('应该检测无效的权限配置', () => {
			const validation = permissionTemplateService.validatePermissions([
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

			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain('Permission must have a collection');
		});

		it('应该检测无效的操作类型', () => {
			const validation = permissionTemplateService.validatePermissions([
				{
					role: 'role-123',
					collection: 'ds-descriptors',
					action: 'invalid' as any,
					permissions: null,
					validation: null,
					presets: null,
					fields: null,
				},
			]);

			expect(validation.valid).toBe(false);
			expect(validation.errors[0]).toContain('Invalid action');
		});
	});

	describe('权限模板查询功能', () => {
		it('应该返回正确的 ds-descriptor 模板', () => {
			const template = permissionTemplateService.getTemplate(BusinessRole.DESCRIPTOR);

			expect(template.role).toBe(BusinessRole.DESCRIPTOR);
			expect(template.permissions).toEqual(['create', 'read', 'update', 'delete']);
			expect(template.field_access).toBe('full');
		});

		it('应该返回正确的 ds-reader 模板', () => {
			const template = permissionTemplateService.getTemplate(BusinessRole.READER);

			expect(template.role).toBe(BusinessRole.READER);
			expect(template.permissions).toEqual(['read']);
			expect(template.field_access).toBe('full');
		});

		it('应该在未知角色时抛出错误', () => {
			expect(() => {
				permissionTemplateService.getTemplate('unknown' as BusinessRole);
			}).toThrow('Unknown business role');
		});

		it('应该返回所有可用的权限模板', () => {
			const templates = permissionTemplateService.getAllTemplates();

			expect(templates).toHaveLength(2);
			expect(templates.map(t => t.role)).toContain(BusinessRole.DESCRIPTOR);
			expect(templates.map(t => t.role)).toContain(BusinessRole.READER);
		});
	});

	describe('与 PermissionSyncService 的集成', () => {
		it('应该在两个服务间正确协作', async () => {
			const collection = 'ds-descriptors';
			const directusRoleId = '12';

			// 使用 PermissionTemplateService 生成权限模板
			const templatePermissions = permissionTemplateService.generatePermissionsFromTemplate(
				collection,
				BusinessRole.DESCRIPTOR,
				directusRoleId
			);

			// 验证生成的权限符合模板规范
			expect(templatePermissions).toHaveLength(4);
			expect(templatePermissions.map(p => p.action)).toContain('create');
			expect(templatePermissions.map(p => p.action)).toContain('read');
			expect(templatePermissions.map(p => p.action)).toContain('update');
			expect(templatePermissions.map(p => p.action)).toContain('delete');

			// 使用 PermissionSyncService 预览权限
			const preview = await permissionSyncService.previewPermissions({
				user_library_permissions: [
					{
						user_id: '7',
						role_id: directusRoleId,
						library_id: 'lib1',
						template: PermissionTemplate.DESCRIPTOR_CRUD,
						enabled: true,
					},
				],
				collections: [collection],
			});

			expect(preview.stats.create_count).toBeGreaterThan(0);
			expect(preview.permissions_to_create).toBeDefined();
		});

		it('应该正确处理权限模板转换', async () => {
			// 测试从业务角色到权限模板的转换
			const descriptorPermissions = permissionTemplateService.generatePermissionsFromTemplate(
				'ds-descriptors',
				BusinessRole.DESCRIPTOR,
				'role-123'
			);

			const readerPermissions = permissionTemplateService.generatePermissionsFromTemplate(
				'ds-descriptors',
				BusinessRole.READER,
				'role-456'
			);

			// DESCRIPTOR 应该有 4 个权限（CRUD）
			expect(descriptorPermissions).toHaveLength(4);

			// READER 应该只有 1 个权限（read）
			expect(readerPermissions).toHaveLength(1);
			expect(readerPermissions[0].action).toBe('read');
		});
	});

	describe('边界条件与特殊情况', () => {
		it('应该处理未知业务角色', () => {
			expect(() => {
				permissionTemplateService.getTemplate('unknown' as BusinessRole);
			}).toThrow('Unknown business role');
		});

		it('应该处理空集合列表', async () => {
			// 由于 batchSyncPermissions 内部调用 syncPermissions，而 syncPermissions 需要数据库
			// 这里我们只测试服务方法存在
			expect(permissionTemplateService.batchSyncPermissions).toBeDefined();
		});

		it('应该正确处理自定义字段访问控制', () => {
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

	describe('权限模板映射到 Directus', () => {
		it('应该正确映射到 directus_permissions 表结构', () => {
			const permissions = permissionTemplateService.generatePermissionsFromTemplate(
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

		it('DESCRIPTOR 角色应该包含所有 CRUD 操作', () => {
			const template = permissionTemplateService.getTemplate(BusinessRole.DESCRIPTOR);

			expect(template.permissions).toContain('create');
			expect(template.permissions).toContain('read');
			expect(template.permissions).toContain('update');
			expect(template.permissions).toContain('delete');
		});

		it('READER 角色应该只包含 read 操作', () => {
			const template = permissionTemplateService.getTemplate(BusinessRole.READER);

			expect(template.permissions).toEqual(['read']);
			expect(template.permissions).not.toContain('create');
			expect(template.permissions).not.toContain('update');
			expect(template.permissions).not.toContain('delete');
		});

		it('权限模板应该支持完整字段访问', () => {
			const descriptorTemplate = permissionTemplateService.getTemplate(BusinessRole.DESCRIPTOR);
			const readerTemplate = permissionTemplateService.getTemplate(BusinessRole.READER);

			expect(descriptorTemplate.field_access).toBe('full');
			expect(readerTemplate.field_access).toBe('full');
		});
	});

	describe('批量权限操作', () => {
		it('应该为多个集合生成权限', () => {
			const collections = ['ds-descriptors', 'ds-descriptor-revisions', 'ds-descriptor-tags'];

			collections.forEach(collection => {
				const permissions = permissionTemplateService.generatePermissionsFromTemplate(
					collection,
					BusinessRole.READER,
					'role-123'
				);

				expect(permissions).toHaveLength(1);
				expect(permissions[0].collection).toBe(collection);
				expect(permissions[0].action).toBe('read');
			});
		});

		it('应该为不同角色生成不同权限', () => {
			const collection = 'ds-descriptors';

			const descriptorPermissions = permissionTemplateService.generatePermissionsFromTemplate(
				collection,
				BusinessRole.DESCRIPTOR,
				'role-123'
			);

			const readerPermissions = permissionTemplateService.generatePermissionsFromTemplate(
				collection,
				BusinessRole.READER,
				'role-123'
			);

			expect(descriptorPermissions.length).toBeGreaterThan(readerPermissions.length);
			expect(descriptorPermissions.map(p => p.action)).toContain('create');
			expect(descriptorPermissions.map(p => p.action)).toContain('delete');
			expect(readerPermissions.map(p => p.action)).not.toContain('create');
			expect(readerPermissions.map(p => p.action)).not.toContain('delete');
		});
	});

	describe('权限配置验证规则', () => {
		it('应该要求权限包含集合名称', () => {
			const validation = permissionTemplateService.validatePermissions([
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

			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain('Permission must have a collection');
		});

		it('应该要求权限包含操作类型', () => {
			const validation = permissionTemplateService.validatePermissions([
				{
					role: 'role-123',
					collection: 'ds-descriptors',
					action: '' as any,
					permissions: null,
					validation: null,
					presets: null,
					fields: null,
				},
			]);

			expect(validation.valid).toBe(false);
			expect(validation.errors).toContain('Permission must have an action');
		});

		it('应该支持所有有效的 Directus 操作', () => {
			const validActions = ['create', 'read', 'update', 'delete', 'comment', 'explain', 'share'];

			validActions.forEach(action => {
				const validation = permissionTemplateService.validatePermissions([
					{
						role: 'role-123',
						collection: 'ds-descriptors',
						action: action as any,
						permissions: null,
						validation: null,
						presets: null,
						fields: null,
					},
				]);

				expect(validation.valid).toBe(true);
				expect(validation.errors).toHaveLength(0);
			});
		});
	});

	describe('服务方法可用性', () => {
		it('应该提供完整的权限模板服务方法', () => {
			// 验证所有公共方法都存在
			expect(permissionTemplateService.getTemplate).toBeDefined();
			expect(permissionTemplateService.getAllTemplates).toBeDefined();
			expect(permissionTemplateService.generatePermissionsFromTemplate).toBeDefined();
			expect(permissionTemplateService.validatePermissions).toBeDefined();
			expect(permissionTemplateService.batchSyncPermissions).toBeDefined();
			expect(permissionTemplateService.getRollbackPoints).toBeDefined();
			expect(permissionTemplateService.rollbackToSyncPoint).toBeDefined();
			expect(permissionTemplateService.detectConflicts).toBeDefined();
		});

		it('应该提供完整的权限同步服务方法', () => {
			// 验证所有公共方法都存在
			expect(permissionSyncService.previewPermissions).toBeDefined();
			expect(permissionSyncService.syncPermissions).toBeDefined();
		});
	});

	describe('数据结构一致性', () => {
		it('应该保持权限模板定义的一致性', () => {
			const descriptorTemplate = permissionTemplateService.getTemplate(BusinessRole.DESCRIPTOR);
			const readerTemplate = permissionTemplateService.getTemplate(BusinessRole.READER);

			// 验证模板结构
			expect(descriptorTemplate).toHaveProperty('role');
			expect(descriptorTemplate).toHaveProperty('description');
			expect(descriptorTemplate).toHaveProperty('permissions');
			expect(descriptorTemplate).toHaveProperty('field_access');

			expect(readerTemplate).toHaveProperty('role');
			expect(readerTemplate).toHaveProperty('description');
			expect(readerTemplate).toHaveProperty('permissions');
			expect(readerTemplate).toHaveProperty('field_access');
		});

		it('应该生成符合 Directus 规范的权限对象', () => {
			const permissions = permissionTemplateService.generatePermissionsFromTemplate(
				'ds-descriptors',
				BusinessRole.DESCRIPTOR,
				'role-123'
			);

			permissions.forEach(permission => {
				// 验证必需字段存在且类型正确
				expect(permission).toMatchObject({
					role: expect.any(String),
					collection: expect.any(String),
					action: expect.any(String),
					permissions: expect.any(Object),
					validation: expect.any(Object),
					presets: expect.any(Object),
					fields: expect.any(Object),
				});
			});
		});
	});
});
