/**
 * 权限同步 API 路由
 * 提供权限同步和预览的 REST API 接口
 */

import { Router, Request, Response } from 'express';
import { PermissionSyncService } from './permission-sync-service';
import {
	PermissionSyncRequest,
	PermissionSyncResponse,
	PermissionPreviewResponse,
	ApiErrorResponse,
	PermissionValidationError,
} from './types';

export function registerRoutes(router: Router): void {
	const BASE_PATH = '/custom/permissions';

	// POST /custom/permissions/sync - 同步权限到 directus_permissions
	router.post(`${BASE_PATH}/sync`, async (req: Request, res: Response) => {
		try {
			// 验证请求体
			const validationErrors = validateSyncRequest(req.body);
			if (validationErrors.length > 0) {
				const errorResponse: ApiErrorResponse = {
					error: 'VALIDATION_ERROR',
					message: '请求数据验证失败',
					errors: validationErrors,
				};
				return res.status(400).json(errorResponse);
			}

			// 获取数据库连接
			const database = req.context?.database;
			if (!database) {
				const errorResponse: ApiErrorResponse = {
					error: 'DATABASE_NOT_AVAILABLE',
					message: '数据库连接不可用',
				};
				return res.status(500).json(errorResponse);
			}

			// 创建服务实例
			const syncService = new PermissionSyncService(database);

			// 执行权限同步
			const syncRequest: PermissionSyncRequest = req.body;
			const syncResult = await syncService.syncPermissions(syncRequest);

			// 构建响应
			const response: PermissionSyncResponse = {
				success: true,
				message: '权限同步成功',
				data: {
					created_ids: syncResult.created_ids,
					updated_ids: syncResult.updated_ids,
					deleted_ids: syncResult.deleted_ids,
					stats: syncResult.stats,
				},
			};

			res.json(response);
		} catch (error) {
			console.error('Permission sync error:', error);
			const errorResponse: ApiErrorResponse = {
				error: 'SYNC_FAILED',
				message: '权限同步失败',
				details: error instanceof Error ? error.message : '未知错误',
			};
			res.status(500).json(errorResponse);
		}
	});

	// GET /custom/permissions/preview - 预览权限变更
	router.get(`${BASE_PATH}/preview`, async (req: Request, res: Response) => {
		try {
			// 从查询参数获取请求数据（支持 GET 请求）
			let requestData: any = {};
			if (req.query.data) {
				try {
					requestData = JSON.parse(req.query.data as string);
				} catch (e) {
					const errorResponse: ApiErrorResponse = {
						error: 'VALIDATION_ERROR',
						message: '无效的 JSON 数据格式',
					};
					return res.status(400).json(errorResponse);
				}
			}

			// 验证请求体
			const validationErrors = validateSyncRequest(requestData);
			if (validationErrors.length > 0) {
				const errorResponse: ApiErrorResponse = {
					error: 'VALIDATION_ERROR',
					message: '请求数据验证失败',
					errors: validationErrors,
				};
				return res.status(400).json(errorResponse);
			}

			// 获取数据库连接
			const database = req.context?.database;
			if (!database) {
				const errorResponse: ApiErrorResponse = {
					error: 'DATABASE_NOT_AVAILABLE',
					message: '数据库连接不可用',
				};
				return res.status(500).json(errorResponse);
			}

			// 创建服务实例
			const syncService = new PermissionSyncService(database);

			// 执行权限预览
			const syncRequest: PermissionSyncRequest = {
				...requestData,
				preview: true,
			};
			const preview = await syncService.previewPermissions(syncRequest);

			// 构建响应
			const response: PermissionPreviewResponse = {
				success: true,
				data: preview,
			};

			res.json(response);
		} catch (error) {
			console.error('Permission preview error:', error);
			const errorResponse: ApiErrorResponse = {
				error: 'PREVIEW_FAILED',
				message: '权限预览失败',
				details: error instanceof Error ? error.message : '未知错误',
			};
			res.status(500).json(errorResponse);
		}
	});

	// POST /custom/permissions/preview - 预览权限变更（POST 版本，支持更大数据）
	router.post(`${BASE_PATH}/preview`, async (req: Request, res: Response) => {
		try {
			// 验证请求体
			const validationErrors = validateSyncRequest(req.body);
			if (validationErrors.length > 0) {
				const errorResponse: ApiErrorResponse = {
					error: 'VALIDATION_ERROR',
					message: '请求数据验证失败',
					errors: validationErrors,
				};
				return res.status(400).json(errorResponse);
			}

			// 获取数据库连接
			const database = req.context?.database;
			if (!database) {
				const errorResponse: ApiErrorResponse = {
					error: 'DATABASE_NOT_AVAILABLE',
					message: '数据库连接不可用',
				};
				return res.status(500).json(errorResponse);
			}

			// 创建服务实例
			const syncService = new PermissionSyncService(database);

			// 执行权限预览
			const syncRequest: PermissionSyncRequest = {
				...req.body,
				preview: true,
			};
			const preview = await syncService.previewPermissions(syncRequest);

			// 构建响应
			const response: PermissionPreviewResponse = {
				success: true,
				data: preview,
			};

			res.json(response);
		} catch (error) {
			console.error('Permission preview error:', error);
			const errorResponse: ApiErrorResponse = {
				error: 'PREVIEW_FAILED',
				message: '权限预览失败',
				details: error instanceof Error ? error.message : '未知错误',
			};
			res.status(500).json(errorResponse);
		}
	});

	// GET /custom/permissions/current - 获取当前用户权限列表
	router.get(`${BASE_PATH}/current`, async (req: Request, res: Response) => {
		try {
			// 获取数据库连接
			const database = req.context?.database;
			if (!database) {
				const errorResponse: ApiErrorResponse = {
					error: 'DATABASE_NOT_AVAILABLE',
					message: '数据库连接不可用',
				};
				return res.status(500).json(errorResponse);
			}

			// 获取当前权限配置
			const permissions = await database
				.select('p.*', 'ulp.user_id', 'ulp.library_id', 'ulp.template', 'ulp.enabled')
				.from('directus_permissions as p')
				.leftJoin(
					'bt_user_library_permissions as ulp',
					'p.role',
					'=',
					'ulp.role_id'
				)
				.whereNotNull('ulp.user_id');

			// 构建响应数据
			const userLibraryPermissions = permissions.map((p: any) => ({
				user_id: p.user_id,
				library_id: p.library_id,
				template: p.template,
				enabled: p.enabled
			}));

			res.json({
				success: true,
				data: userLibraryPermissions
			});
		} catch (error) {
			console.error('Get current permissions error:', error);
			const errorResponse: ApiErrorResponse = {
				error: 'FETCH_FAILED',
				message: '获取当前权限失败',
				details: error instanceof Error ? error.message : '未知错误',
			};
			res.status(500).json(errorResponse);
		}
	});
}

/**
 * 验证权限同步请求
 */
function validateSyncRequest(request: any): PermissionValidationError[] {
	const errors: PermissionValidationError[] = [];

	// 验证 user_library_permissions 是否存在
	if (!request.user_library_permissions || !Array.isArray(request.user_library_permissions)) {
		errors.push({
			field: 'user_library_permissions',
			message: 'user_library_permissions 必须是数组',
			code: 'INVALID_TYPE',
		});
		return errors;
	}

	// 验证每个权限条目
	request.user_library_permissions.forEach((permission: any, index: number) => {
		if (!permission.user_id) {
			errors.push({
				field: `user_library_permissions[${index}].user_id`,
				message: 'user_id 是必填字段',
				code: 'REQUIRED_FIELD',
			});
		}

		if (!permission.library_id) {
			errors.push({
				field: `user_library_permissions[${index}].library_id`,
				message: 'library_id 是必填字段',
				code: 'REQUIRED_FIELD',
			});
		}

		if (!permission.template) {
			errors.push({
				field: `user_library_permissions[${index}].template`,
				message: 'template 是必填字段',
				code: 'REQUIRED_FIELD',
			});
		}

		if (typeof permission.enabled !== 'boolean') {
			errors.push({
				field: `user_library_permissions[${index}].enabled`,
				message: 'enabled 必须是布尔值',
				code: 'INVALID_TYPE',
			});
		}
	});

	return errors;
}
