/**
 * 导入审计 Hook
 * 监听 Directus items 事件，记录导入错误和审计日志
 */

import { defineHook } from '@directus/extensions-sdk';
import { ImportAuditLogger, ErrorSeverity, ErrorType } from './audit-logger';

export default defineHook(({ filter, action }, context) => {
	const { database, logger, services } = context;
	const auditLogger = new ImportAuditLogger(database);

	// 监听 items.error 事件
	filter('items.error', async (input, meta, context) => {
		const startTime = Date.now();

		try {
			const { collection, payload } = meta;

			// 只处理数据集相关的集合
			if (!collection || !collection.startsWith('bt_')) {
				return input;
			}

			// 提取导入作业 ID（从 payload 或上下文中）
			const importJobId = extractImportJobId(payload);

			if (!importJobId) {
				logger.warn(`[ImportValidator] No import job ID found for collection: ${collection}`);
				return input;
			}

			// 处理错误信息
			const errors = Array.isArray(input) ? input : [input];

			for (const error of errors) {
				const errorRecord = {
					import_job_id: importJobId,
					row_number: extractRowNumber(payload) || 0,
					sheet_name: extractSheetName(payload),
					error_type: auditLogger.categorizeError(error),
					error_message: error.message || 'Unknown error',
					field_name: extractFieldName(error),
					row_data: extractRowData(payload),
					severity: auditLogger.analyzeErrorSeverity(error),
				};

				try {
					await auditLogger.logImportError(errorRecord);
				} catch (logError) {
					logger.error(`[ImportValidator] Failed to log import error: ${logError.message}`);
				}
			}

			// 更新导入作业的错误状态
			await updateImportJobErrorStatus(database, importJobId, true);

			const duration = Date.now() - startTime;
			logger.info(`[ImportValidator] Logged ${errors.length} error(s) for job ${importJobId} in ${duration}ms`);

			return input;
		} catch (error) {
			logger.error(`[ImportValidator] Error in items.error handler: ${error.message}`);
			return input;
		}
	});

	// 监听 items.afterCreate 事件
	action('items.afterCreate', async (meta, context) => {
		const startTime = Date.now();

		try {
			const { collection, payload } = meta;

			// 只处理数据集相关的集合
			if (!collection || !collection.startsWith('bt_')) {
				return;
			}

			// 提取导入作业 ID
			const importJobId = extractImportJobId(meta);

			if (!importJobId) {
				return;
			}

			// 记录审计日志
			const auditRecord = {
				action_type: 'item_create',
				action_category: 'dataset_import' as const,
				target_type: collection,
				target_id: meta.key,
				target_name: extractTargetName(payload),
				operation_details: {
					collection,
					payload: sanitizePayload(payload),
					meta: {
						accountability: context.accountability,
					},
				},
				changes_summary: `Created item in ${collection}`,
				performed_by_user_id: context.accountability?.user,
				performed_by_role_id: context.accountability?.role,
				user_ip_address: context.accountability?.ip,
				user_agent: context.accountability?.userAgent,
				status: 'success' as const,
				result_message: `Successfully created item ${meta.key} in ${collection}`,
				risk_level: assessRiskLevel(collection, payload) as any,
			};

			try {
				await auditLogger.logAction(auditRecord);
			} catch (logError) {
				logger.error(`[ImportValidator] Failed to log audit action: ${logError.message}`);
			}

			const duration = Date.now() - startTime;
			logger.info(`[ImportValidator] Logged audit for item creation in ${collection} (${duration}ms)`);
		} catch (error) {
			logger.error(`[ImportValidator] Error in items.afterCreate handler: ${error.message}`);
		}
	});

	// 监听 items.afterUpdate 事件
	action('items.afterUpdate', async (meta, context) => {
		try {
			const { collection, payload } = meta;

			if (!collection || !collection.startsWith('bt_')) {
				return;
			}

			const importJobId = extractImportJobId(meta);
			if (!importJobId) {
				return;
			}

			const auditRecord = {
				action_type: 'item_update',
				action_category: 'dataset_import' as const,
				target_type: collection,
				target_id: meta.key,
				target_name: extractTargetName(payload),
				operation_details: {
					collection,
					payload: sanitizePayload(payload),
					keys: meta.keys,
				},
				changes_summary: `Updated item(s) in ${collection}`,
				performed_by_user_id: context.accountability?.user,
				performed_by_role_id: context.accountability?.role,
				user_ip_address: context.accountability?.ip,
				user_agent: context.accountability?.userAgent,
				status: 'success' as const,
				result_message: `Successfully updated ${meta.keys?.length || 1} item(s) in ${collection}`,
				risk_level: assessRiskLevel(collection, payload) as any,
			};

			await auditLogger.logAction(auditRecord);
		} catch (error) {
			logger.error(`[ImportValidator] Error in items.afterUpdate handler: ${error.message}`);
		}
	});

	// 监听 items.afterDelete 事件
	action('items.afterDelete', async (meta, context) => {
		try {
			const { collection } = meta;

			if (!collection || !collection.startsWith('bt_')) {
				return;
			}

			const auditRecord = {
				action_type: 'item_delete',
				action_category: 'dataset_import' as const,
				target_type: collection,
				target_id: meta.key,
				operation_details: {
					collection,
					keys: meta.keys,
				},
				changes_summary: `Deleted ${meta.keys?.length || 1} item(s) from ${collection}`,
				performed_by_user_id: context.accountability?.user,
				performed_by_role_id: context.accountability?.role,
				user_ip_address: context.accountability?.ip,
				user_agent: context.accountability?.userAgent,
				status: 'success' as const,
				result_message: `Successfully deleted ${meta.keys?.length || 1} item(s) from ${collection}`,
				risk_level: 'high' as const,
			};

			await auditLogger.logAction(auditRecord);
		} catch (error) {
			logger.error(`[ImportValidator] Error in items.afterDelete handler: ${error.message}`);
		}
	});

	logger.info('[ImportValidator] Import audit hook registered successfully');
});

/**
 * 从 payload 或 meta 中提取导入作业 ID
 */
function extractImportJobId(data: any): number | null {
	if (!data) return null;

	// 尝试从多个位置获取 import_job_id
	if (data.import_job_id) return data.import_job_id;
	if (data.payload?.import_job_id) return data.payload.import_job_id;
	if (data.body?.import_job_id) return data.body.import_job_id;
	if (data.query?.import_job_id) return data.query.import_job_id;
	if (data.headers?.['x-import-job-id']) return parseInt(data.headers['x-import-job-id'], 10);

	return null;
}

/**
 * 提取行号
 */
function extractRowNumber(data: any): number | null {
	if (!data) return null;

	if (data.row_number) return data.row_number;
	if (data.payload?.row_number) return data.payload.row_number;
	if (data.body?.row_number) return data.body.row_number;

	return null;
}

/**
 * 提取工作表名称
 */
function extractSheetName(data: any): string | undefined {
	if (!data) return undefined;

	if (data.sheet_name) return data.sheet_name;
	if (data.payload?.sheet_name) return data.payload.sheet_name;
	if (data.body?.sheet_name) return data.body.sheet_name;

	return undefined;
}

/**
 * 提取字段名
 */
function extractFieldName(error: any): string | undefined {
	if (error.field) return error.field;
	if (error.path) return Array.isArray(error.path) ? error.path.join('.') : error.path;
	if (error.details?.field) return error.details.field;

	return undefined;
}

/**
 * 提取行数据
 */
function extractRowData(data: any): Record<string, any> | undefined {
	if (!data) return undefined;

	if (data.row_data) return data.row_data;
	if (data.payload?.data) return data.payload.data;
	if (data.body?.data) return data.body.data;

	return undefined;
}

/**
 * 提取目标名称
 */
function extractTargetName(payload: any): string | undefined {
	if (!payload) return undefined;

	if (payload.name) return payload.name;
	if (payload.title) return payload.title;
	if (payload.label) return payload.label;

	return undefined;
}

/**
 * 清理敏感数据
 */
function sanitizePayload(payload: any): any {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}

	const sanitized = { ...payload };
	const sensitiveFields = ['password', 'token', 'secret', 'key', 'api_key'];

	for (const field of sensitiveFields) {
		if (field in sanitized) {
			sanitized[field] = '[REDACTED]';
		}
	}

	return sanitized;
}

/**
 * 评估风险级别
 */
function assessRiskLevel(collection: string, payload: any): string {
	// 删除操作为高风险
	if (collection.includes('delete') || collection.includes('remove')) {
		return 'high';
	}

	// 批量操作为中高风险
	if (payload?.bulk || payload?.batch) {
		return 'medium';
	}

	// 系统配置为高风险
	if (collection.includes('config') || collection.includes('setting')) {
		return 'high';
	}

	// 权限相关为高风险
	if (collection.includes('permission') || collection.includes('role') || collection.includes('user')) {
		return 'high';
	}

	// 默认为低风险
	return 'low';
}

/**
 * 更新导入作业的错误状态
 */
async function updateImportJobErrorStatus(database: any, importJobId: number, hasErrors: boolean): Promise<void> {
	try {
		await database('bt_import_jobs')
			.where('id', importJobId)
			.update({
				has_errors: hasErrors,
				error_summary: hasErrors ? 'Import completed with errors' : null,
			});
	} catch (error) {
		console.error(`[ImportValidator] Failed to update import job error status: ${error.message}`);
	}
}
