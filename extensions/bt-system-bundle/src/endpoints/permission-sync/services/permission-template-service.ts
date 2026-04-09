/**
 * Permission Template Service
 * 负责业务角色到 Directus 权限的翻译服务
 * 定义权限模板并映射到 directus_permissions 表
 */

import { Knex } from 'knex';
import type { DirectusPermission, PermissionAction } from '../types';

/**
 * 业务角色类型
 */
export enum BusinessRole {
	DESCRIPTOR = 'ds-descriptor', // 数据描述者：CRUD 全部权限
	READER = 'ds-reader',         // 数据读取者：Read 只读权限
}

/**
 * 权限模板定义
 */
export interface PermissionTemplate {
	role: BusinessRole;
	description: string;
	permissions: PermissionAction[];
	field_access: 'full' | 'custom';
	custom_fields?: string[];
}

/**
 * 权限同步结果
 */
export interface PermissionSyncResult {
	success: boolean;
	collection: string;
	role: BusinessRole;
	permissions_created: number;
	permissions_updated: number;
	permissions_deleted: number;
	errors: string[];
	sync_log_id?: number;
}

/**
 * 权限差异对比
 */
export interface PermissionDiff {
	action: 'create' | 'update' | 'delete' | 'no_change';
	permission: DirectusPermission;
	reason?: string;
}

/**
 * 权限预览详情
 */
export interface PermissionPreviewDetail {
	collection: string;
	role: BusinessRole;
	current_permissions: DirectusPermission[];
	template_permissions: DirectusPermission[];
	differences: PermissionDiff[];
	summary: {
		to_create: number;
		to_update: number;
		to_delete: number;
		unchanged: number;
	};
}

/**
 * 回滚点
 */
export interface RollbackPoint {
	sync_log_id: number;
	timestamp: Date;
	permissions_snapshot: DirectusPermission[];
	collection: string;
	role_id: string | null;
}

/**
 * 权限模板服务类
 */
export class PermissionTemplateService {
	private database: Knex;
	private readonly PERMISSIONS_TABLE = 'directus_permissions';
	private readonly SYNC_LOGS_TABLE = 'bt_permission_sync_logs';

	// 预定义权限模板
	private readonly TEMPLATES: Record<BusinessRole, PermissionTemplate> = {
		[BusinessRole.DESCRIPTOR]: {
			role: BusinessRole.DESCRIPTOR,
			description: '数据描述者：拥有完整的 CRUD 权限',
			permissions: ['create', 'read', 'update', 'delete'],
			field_access: 'full',
		},
		[BusinessRole.READER]: {
			role: BusinessRole.READER,
			description: '数据读取者：仅拥有只读权限',
			permissions: ['read'],
			field_access: 'full',
		},
	};

	constructor(database: Knex) {
		this.database = database;
	}

	/**
	 * 获取指定角色的权限模板
	 */
	getTemplate(role: BusinessRole): PermissionTemplate {
		const template = this.TEMPLATES[role];
		if (!template) {
			throw new Error(`Unknown business role: ${role}`);
		}
		return template;
	}

	/**
	 * 获取所有可用的权限模板
	 */
	getAllTemplates(): PermissionTemplate[] {
		return Object.values(this.TEMPLATES);
	}

	/**
	 * 根据模板生成 Directus 权限记录
	 */
	generatePermissionsFromTemplate(
		collection: string,
		role: BusinessRole,
		directusRoleId: string | null = null
	): DirectusPermission[] {
		const template = this.getTemplate(role);
		const permissions: DirectusPermission[] = [];

		for (const action of template.permissions) {
			permissions.push({
				role: directusRoleId,
				collection,
				action,
				permissions: null,
				validation: null,
				presets: null,
				fields: template.field_access === 'full' ? null : template.custom_fields || null,
			});
		}

		return permissions;
	}

	/**
	 * 预览权限变更（不实际执行）
	 */
	async previewPermissions(
		collection: string,
		role: BusinessRole,
		directusRoleId: string | null = null
	): Promise<PermissionPreviewDetail> {
		const template = this.getTemplate(role);
		const templatePermissions = this.generatePermissionsFromTemplate(
			collection,
			role,
			directusRoleId
		);

		const currentPermissions = await this.getCurrentPermissions(
			collection,
			directusRoleId
		);

		const differences = this.calculateDifferences(
			currentPermissions,
			templatePermissions
		);

		const summary = {
			to_create: differences.filter(d => d.action === 'create').length,
			to_update: differences.filter(d => d.action === 'update').length,
			to_delete: differences.filter(d => d.action === 'delete').length,
			unchanged: differences.filter(d => d.action === 'no_change').length,
		};

		return {
			collection,
			role,
			current_permissions: currentPermissions,
			template_permissions: templatePermissions,
			differences,
			summary,
		};
	}

	/**
	 * 同步权限到 Directus
	 */
	async syncPermissions(
		collection: string,
		role: BusinessRole,
		directusRoleId: string | null = null,
		userId?: number,
		dryRun: boolean = false
	): Promise<PermissionSyncResult> {
		const preview = await this.previewPermissions(
			collection,
			role,
			directusRoleId
		);

		const result: PermissionSyncResult = {
			success: true,
			collection,
			role,
			permissions_created: 0,
			permissions_updated: 0,
			permissions_deleted: 0,
			errors: [],
		};

		if (dryRun) {
			return result;
		}

		const syncLogId = await this.createSyncLog({
			operation_type: 'bulk_sync',
			collection_name: collection,
			dataset_registry_id: null,
			permission_type: role,
			role_id: directusRoleId ? parseInt(directusRoleId) : null,
			user_id: userId,
			status: 'in_progress',
			permissions_before: JSON.stringify(preview.current_permissions),
			permissions_after: JSON.stringify(preview.template_permissions),
		});

		result.sync_log_id = syncLogId;

		try {
			await this.database.transaction(async (trx) => {
				for (const diff of preview.differences) {
					try {
						switch (diff.action) {
							case 'create':
								await trx(this.PERMISSIONS_TABLE).insert({
									role: diff.permission.role,
									collection: diff.permission.collection,
									action: diff.permission.action,
									permissions: diff.permission.permissions
										? JSON.stringify(diff.permission.permissions)
										: null,
									validation: diff.permission.validation
										? JSON.stringify(diff.permission.validation)
										: null,
									presets: diff.permission.presets
										? JSON.stringify(diff.permission.presets)
										: null,
									fields: diff.permission.fields
										? JSON.stringify(diff.permission.fields)
										: null,
								});
								result.permissions_created++;
								break;

							case 'update':
								await trx(this.PERMISSIONS_TABLE)
									.where({
										role: diff.permission.role,
										collection: diff.permission.collection,
										action: diff.permission.action,
									})
									.update({
										permissions: diff.permission.permissions
											? JSON.stringify(diff.permission.permissions)
											: null,
										validation: diff.permission.validation
											? JSON.stringify(diff.permission.validation)
											: null,
										presets: diff.permission.presets
											? JSON.stringify(diff.permission.presets)
											: null,
										fields: diff.permission.fields
											? JSON.stringify(diff.permission.fields)
											: null,
									});
								result.permissions_updated++;
								break;

							case 'delete':
								await trx(this.PERMISSIONS_TABLE)
									.where({
										role: diff.permission.role,
										collection: diff.permission.collection,
										action: diff.permission.action,
									})
									.del();
								result.permissions_deleted++;
								break;
						}
					} catch (error) {
						const message = error instanceof Error ? error.message : 'Unknown error';
						result.errors.push(`Failed to ${diff.action} permission: ${message}`);
					}
				}
			});

			await this.updateSyncLog(syncLogId, {
				status: result.errors.length > 0 ? 'partial' : 'completed',
				changes_made: JSON.stringify({
					created: result.permissions_created,
					updated: result.permissions_updated,
					deleted: result.permissions_deleted,
					errors: result.errors,
				}),
			});

			result.success = result.errors.length === 0;
		} catch (error) {
			await this.updateSyncLog(syncLogId, {
				status: 'failed',
				error_message: error instanceof Error ? error.message : 'Unknown error',
			});

			result.success = false;
			result.errors.push(error instanceof Error ? error.message : 'Unknown error');
		}

		return result;
	}

	/**
	 * 批量同步多个集合的权限
	 */
	async batchSyncPermissions(
		collections: string[],
		role: BusinessRole,
		directusRoleId: string | null = null,
		userId?: number
	): Promise<PermissionSyncResult[]> {
		const results: PermissionSyncResult[] = [];

		for (const collection of collections) {
			const result = await this.syncPermissions(
				collection,
				role,
				directusRoleId,
				userId
			);
			results.push(result);
		}

		return results;
	}

	/**
	 * 回滚权限到指定的同步点
	 */
	async rollbackToSyncPoint(
		syncLogId: number,
		userId?: number
	): Promise<boolean> {
		const syncLog = await this.database(this.SYNC_LOGS_TABLE)
			.where('id', syncLogId)
			.first();

		if (!syncLog) {
			throw new Error(`Sync log not found: ${syncLogId}`);
		}

		const permissionsBefore = syncLog.permissions_before
			? JSON.parse(syncLog.permissions_before)
			: [];

		try {
			await this.database.transaction(async (trx) => {
				await trx(this.PERMISSIONS_TABLE)
					.where({
						collection: syncLog.collection_name,
						role: syncLog.role_id,
					})
					.del();

				for (const permission of permissionsBefore) {
					await trx(this.PERMISSIONS_TABLE).insert({
						role: permission.role,
						collection: permission.collection,
						action: permission.action,
						permissions: permission.permissions
							? JSON.stringify(permission.permissions)
							: null,
						validation: permission.validation
							? JSON.stringify(permission.validation)
							: null,
						presets: permission.presets
							? JSON.stringify(permission.presets)
							: null,
						fields: permission.fields
							? JSON.stringify(permission.fields)
							: null,
					});
				}
			});

			await this.createSyncLog({
				operation_type: 'update',
				collection_name: syncLog.collection_name,
				dataset_registry_id: syncLog.dataset_registry_id,
				permission_type: 'rollback',
				role_id: syncLog.role_id,
				user_id: userId,
				status: 'completed',
				permissions_after: syncLog.permissions_before,
				changes_made: JSON.stringify({
					rollback_from_sync_log_id: syncLogId,
				}),
			});

			return true;
		} catch (error) {
			throw new Error(`Rollback failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * 获取可用的回滚点列表
	 */
	async getRollbackPoints(
		collection?: string,
		roleId?: string | null,
		limit: number = 10
	): Promise<RollbackPoint[]> {
		let query = this.database(this.SYNC_LOGS_TABLE)
			.select('*')
			.where('status', 'completed')
			.orderBy('created_at', 'desc')
			.limit(limit);

		if (collection) {
			query = query.where('collection_name', collection);
		}

		if (roleId !== undefined) {
			query = query.where('role_id', roleId);
		}

		const logs = await query;

		return logs.map((log) => ({
			sync_log_id: log.id,
			timestamp: log.created_at,
			permissions_snapshot: log.permissions_before
				? JSON.parse(log.permissions_before)
				: [],
			collection: log.collection_name,
			role_id: log.role_id,
		}));
	}

	/**
	 * 验证权限配置
	 */
	validatePermissions(
		permissions: DirectusPermission[]
	): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		for (const permission of permissions) {
			if (!permission.collection) {
				errors.push('Permission must have a collection');
			}

			if (!permission.action) {
				errors.push('Permission must have an action');
			}

			const validActions: PermissionAction[] = [
				'create',
				'read',
				'update',
				'delete',
				'comment',
				'explain',
				'share',
			];

			if (!validActions.includes(permission.action)) {
				errors.push(`Invalid action: ${permission.action}`);
			}
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * 检测权限冲突
	 */
	async detectConflicts(
		collection: string,
		directusRoleId: string | null
	): Promise<string[]> {
		const conflicts: string[] = [];

		const currentPermissions = await this.getCurrentPermissions(
			collection,
			directusRoleId
		);

		const seen = new Set<string>();
		for (const permission of currentPermissions) {
			const key = `${permission.collection}:${permission.action}:${permission.role}`;
			if (seen.has(key)) {
				conflicts.push(`Duplicate permission found: ${key}`);
			}
			seen.add(key);
		}

		return conflicts;
	}

	/**
	 * 获取当前权限
	 */
	private async getCurrentPermissions(
		collection: string,
		roleId: string | null
	): Promise<DirectusPermission[]> {
		const query = this.database(this.PERMISSIONS_TABLE).where(
			'collection',
			collection
		);

		if (roleId !== null && roleId !== undefined) {
			query.where('role', roleId);
		} else {
			query.whereNull('role');
		}

		const permissions = await query;

		return permissions.map((p) => ({
			id: p.id,
			role: p.role,
			collection: p.collection,
			action: p.action,
			permissions: p.permissions ? JSON.parse(p.permissions) : null,
			validation: p.validation ? JSON.parse(p.validation) : null,
			presets: p.presets ? JSON.parse(p.presets) : null,
			fields: p.fields ? JSON.parse(p.fields) : null,
		}));
	}

	/**
	 * 计算权限差异
	 */
	private calculateDifferences(
		current: DirectusPermission[],
		target: DirectusPermission[]
	): PermissionDiff[] {
		const differences: PermissionDiff[] = [];

		const currentMap = new Map<string, DirectusPermission>();
		const targetMap = new Map<string, DirectusPermission>();

		for (const p of current) {
			const key = `${p.collection}:${p.action}`;
			currentMap.set(key, p);
		}

		for (const p of target) {
			const key = `${p.collection}:${p.action}`;
			targetMap.set(key, p);
		}

		for (const [key, targetPerm] of targetMap) {
			const currentPerm = currentMap.get(key);

			if (!currentPerm) {
				differences.push({
					action: 'create',
					permission: targetPerm,
					reason: 'New permission from template',
				});
			} else if (!this.permissionsEqual(currentPerm, targetPerm)) {
				differences.push({
					action: 'update',
					permission: targetPerm,
					reason: 'Permission configuration changed',
				});
			} else {
				differences.push({
					action: 'no_change',
					permission: targetPerm,
				});
			}
		}

		for (const [key, currentPerm] of currentMap) {
			if (!targetMap.has(key)) {
				differences.push({
					action: 'delete',
					permission: currentPerm,
					reason: 'Permission not in template',
				});
			}
		}

		return differences;
	}

	/**
	 * 比较两个权限是否相等
	 */
	private permissionsEqual(
		a: DirectusPermission,
		b: DirectusPermission
	): boolean {
		return (
			a.collection === b.collection &&
			a.action === b.action &&
			a.role === b.role &&
			JSON.stringify(a.fields) === JSON.stringify(b.fields) &&
			JSON.stringify(a.permissions) === JSON.stringify(b.permissions) &&
			JSON.stringify(a.validation) === JSON.stringify(b.validation) &&
			JSON.stringify(a.presets) === JSON.stringify(b.presets)
		);
	}

	/**
	 * 创建同步日志
	 */
	private async createSyncLog(data: {
		operation_type: string;
		collection_name: string;
		dataset_registry_id: number | null;
		permission_type: string;
		role_id: number | null;
		user_id?: number;
		status: string;
		permissions_before?: string;
		permissions_after?: string;
		changes_made?: string;
		error_message?: string;
	}): Promise<number> {
		const [id] = await this.database(this.SYNC_LOGS_TABLE).insert({
			operation_type: data.operation_type,
			collection_name: data.collection_name,
			dataset_registry_id: data.dataset_registry_id,
			permission_type: data.permission_type,
			role_id: data.role_id,
			user_id: data.user_id || null,
			status: data.status,
			permissions_before: data.permissions_before || null,
			permissions_after: data.permissions_after || null,
			changes_made: data.changes_made || null,
			error_message: data.error_message || null,
			performed_by_user_id: data.user_id || null,
			created_at: new Date(),
		});

		return id;
	}

	/**
	 * 更新同步日志
	 */
	private async updateSyncLog(
		id: number,
		updates: {
			status?: string;
			changes_made?: string;
			error_message?: string;
		}
	): Promise<void> {
		await this.database(this.SYNC_LOGS_TABLE)
			.where('id', id)
			.update({
				...updates,
			});
	}
}
