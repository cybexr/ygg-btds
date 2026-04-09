/**
 * 权限同步服务
 * 负责将用户-库权限矩阵转换为 Directus 原生权限配置
 */

import { Knex } from 'knex';
import {
	UserLibraryPermission,
	DirectusPermission,
	PermissionPreview,
	PermissionSyncRequest,
	PermissionStats,
	PermissionConflict,
	PermissionTemplate,
} from './types';
import { getPermissionTemplate, getTemplateCollections } from './templates';

export class PermissionSyncService {
	private database: Knex;

	constructor(database: Knex) {
		this.database = database;
	}

	/**
	 * 预览权限变更
	 */
	async previewPermissions(request: PermissionSyncRequest): Promise<PermissionPreview> {
		const { user_library_permissions, collections } = request;

		// 初始化结果
		const permissionsToCreate: DirectusPermission[] = [];
		const permissionsToUpdate: DirectusPermission[] = [];
		const permissionsToDelete: number[] = [];
		const conflicts: PermissionConflict[] = [];

		// 获取现有权限
		const existingPermissions = await this.getExistingPermissions(user_library_permissions);

		// 处理每个用户-库权限
		for (const ulp of user_library_permissions) {
			if (!ulp.enabled) {
				// 如果权限未启用，标记现有权限为删除
				const toDelete = existingPermissions
					.filter(p => p.user_id === ulp.user_id && p.library_id === ulp.library_id)
					.map(p => p.id!);
				permissionsToDelete.push(...toDelete);
				continue;
			}

			// 获取权限模板
			const templateDef = getPermissionTemplate(ulp.template);
			const collectionsToSync = collections || templateDef.applicable_collections;

			// 为每个集合生成权限
			for (const collection of collectionsToSync) {
				if (!templateDef.applicable_collections.includes(collection)) {
					continue;
				}

				// 生成权限配置
				const permissionConfig = this.generatePermissionConfig(
					ulp,
					collection,
					templateDef.default_config.actions
				);

				// 检查是否已存在相同权限
				const existing = existingPermissions.find(
					p =>
						p.user_id === ulp.user_id &&
						p.library_id === ulp.library_id &&
						p.collection === collection &&
						p.action === permissionConfig.action
				);

				if (existing) {
					// 检查是否需要更新
					if (this.permissionChanged(existing, permissionConfig)) {
						permissionsToUpdate.push({
							...permissionConfig,
							id: existing.id,
						});
					}
				} else {
					permissionsToCreate.push(permissionConfig);
				}
			}
		}

		// 生成统计信息
		const stats: PermissionStats = {
			users_count: new Set(user_library_permissions.map(p => p.user_id)).size,
			libraries_count: new Set(user_library_permissions.map(p => p.library_id)).size,
			create_count: permissionsToCreate.length,
			update_count: permissionsToUpdate.length,
			delete_count: permissionsToDelete.length,
			conflict_count: conflicts.length,
		};

		return {
			permissions_to_create: permissionsToCreate,
			permissions_to_update: permissionsToUpdate,
			permissions_to_delete: permissionsToDelete,
			conflicts: conflicts,
			stats,
		};
	}

	/**
	 * 同步权限到数据库
	 */
	async syncPermissions(request: PermissionSyncRequest): Promise<{
		created_ids: number[];
		updated_ids: number[];
		deleted_ids: number[];
		stats: PermissionStats;
	}> {
		const preview = await this.previewPermissions(request);
		const created_ids: number[] = [];
		const updated_ids: number[] = [];
		const deleted_ids: number[] = [];

		// 使用事务处理
		await this.database.transaction(async (trx) => {
			// 删除权限
			if (preview.permissions_to_delete.length > 0) {
				await trx('directus_permissions')
					.delete()
					.whereIn('id', preview.permissions_to_delete);
				deleted_ids.push(...preview.permissions_to_delete);
			}

			// 创建权限
			for (const permission of preview.permissions_to_create) {
				const [id] = await trx('directus_permissions')
					.insert({
						role: permission.role,
						collection: permission.collection,
						action: permission.action,
						permissions: permission.permissions ? JSON.stringify(permission.permissions) : null,
						validation: permission.validation ? JSON.stringify(permission.validation) : null,
						presets: permission.presets ? JSON.stringify(permission.presets) : null,
						fields: permission.fields ? JSON.stringify(permission.fields) : null,
					})
					.returning('id');
				created_ids.push(id.id);
			}

			// 更新权限
			for (const permission of preview.permissions_to_update) {
				await trx('directus_permissions')
					.update({
						role: permission.role,
						collection: permission.collection,
						action: permission.action,
						permissions: permission.permissions ? JSON.stringify(permission.permissions) : null,
						validation: permission.validation ? JSON.stringify(permission.validation) : null,
						presets: permission.presets ? JSON.stringify(permission.presets) : null,
						fields: permission.fields ? JSON.stringify(permission.fields) : null,
					})
					.where('id', permission.id);
				updated_ids.push(permission.id!);
			}
		});

		return {
			created_ids,
			updated_ids,
			deleted_ids,
			stats: preview.stats,
		};
	}

	/**
	 * 获取现有权限
	 */
	private async getExistingPermissions(
		userLibraryPermissions: UserLibraryPermission[]
	): Promise<Array<DirectusPermission & { user_id: string; library_id: string }>> {
		const userIds = userLibraryPermissions.map(p => p.user_id);
		const libraryIds = userLibraryPermissions.map(p => p.library_id);

		// 从数据库获取现有权限
		// 注意：这里假设有一个中间表 bt_user_library_permissions 来关联用户、库和角色
		// 如果没有这个表，需要调整查询逻辑
		try {
			const permissions = await this.database
				.select('p.*', 'ulp.user_id', 'ulp.library_id')
				.from('directus_permissions as p')
				.leftJoin(
					'bt_user_library_permissions as ulp',
					'p.role',
					'=',
					'ulp.role_id'
				)
				.whereIn('ulp.user_id', userIds)
				.whereIn('ulp.library_id', libraryIds);

			return permissions;
		} catch (error) {
			// 如果表不存在，返回空数组
			console.warn('bt_user_library_permissions table does not exist yet:', error);
			return [];
		}
	}

	/**
	 * 生成权限配置
	 */
	private generatePermissionConfig(
		ulp: UserLibraryPermission,
		collection: string,
		actions: string[]
	): DirectusPermission {
		// 如果有自定义权限配置，使用自定义配置
		if (ulp.custom_permissions && ulp.custom_permissions.actions && ulp.custom_permissions.actions.length > 0) {
			return {
				role: ulp.user_id, // 使用 user_id 作为 role
				collection,
				action: ulp.custom_permissions.actions[0] as any,
				permissions: ulp.custom_permissions.permissions || null,
				validation: ulp.custom_permissions.validation || null,
				presets: ulp.custom_permissions.presets || null,
				fields: ulp.custom_permissions.fields || null,
			};
		}

		// 否则为每个动作生成一个权限配置
		return {
			role: ulp.user_id,
			collection,
			action: actions[0] as any,
			permissions: null,
			validation: null,
			presets: null,
			fields: null,
		};
	}

	/**
	 * 检查权限是否发生变化
	 */
	private permissionChanged(existing: DirectusPermission, proposed: DirectusPermission): boolean {
		return (
			existing.role !== proposed.role ||
			existing.collection !== proposed.collection ||
			existing.action !== proposed.action ||
			JSON.stringify(existing.permissions) !== JSON.stringify(proposed.permissions) ||
			JSON.stringify(existing.validation) !== JSON.stringify(proposed.validation) ||
			JSON.stringify(existing.presets) !== JSON.stringify(proposed.presets) ||
			JSON.stringify(existing.fields) !== JSON.stringify(proposed.fields)
		);
	}
}
