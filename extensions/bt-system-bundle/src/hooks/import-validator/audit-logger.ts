/**
 * 导入审计日志器
 * 负责记录导入错误和审计日志到数据库
 */

import { Knex } from 'knex';

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
	INFO = 'info',
	WARNING = 'warning',
	ERROR = 'error',
	CRITICAL = 'critical',
}

/**
 * 错误类型分类
 */
export enum ErrorType {
	VALIDATION = 'validation',
	CONSTRAINT = 'constraint',
	FORMAT = 'format',
	DATABASE = 'database',
	PERMISSION = 'permission',
	SYSTEM = 'system',
}

/**
 * 错误统计信息
 */
export interface ErrorStatistics {
	total_errors: number;
	by_severity: Record<string, number>;
	by_type: Record<string, number>;
	resolved_errors: number;
	unresolved_errors: number;
}

/**
 * 导入错误记录
 */
export interface ImportErrorRecord {
	import_job_id: number;
	row_number: number;
	sheet_name?: string;
	error_type: string;
	error_message: string;
	field_name?: string;
	row_data?: Record<string, any>;
	severity: ErrorSeverity;
}

/**
 * 审计日志记录
 */
export interface AuditLogRecord {
	action_type: string;
	action_category: string;
	target_type?: string;
	target_id?: string;
	target_name?: string;
	operation_details?: Record<string, any>;
	changes_summary?: string;
	performed_by_user_id?: number | string;
	performed_by_role_id?: number | string;
	user_ip_address?: string;
	user_agent?: string;
	status: 'success' | 'failed' | 'partial';
	result_message?: string;
	risk_level: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 导入审计日志器类
 */
export class ImportAuditLogger {
	private database: Knex;

	constructor(database: Knex) {
		this.database = database;
	}

	/**
	 * 记录导入错误
	 */
	async logImportError(errorRecord: ImportErrorRecord): Promise<number> {
		try {
			const [id] = await this.database('bt_import_errors').insert({
				import_job_id: errorRecord.import_job_id,
				row_number: errorRecord.row_number,
				sheet_name: errorRecord.sheet_name,
				error_type: errorRecord.error_type,
				error_message: errorRecord.error_message,
				field_name: errorRecord.field_name,
				row_data: errorRecord.row_data || {},
				severity: errorRecord.severity,
				is_resolved: false,
				created_at: new Date(),
			});

			return id as number;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to log import error:', error);
			throw error;
		}
	}

	/**
	 * 批量记录导入错误
	 */
	async logImportErrors(errorRecords: ImportErrorRecord[]): Promise<number[]> {
		try {
			const timestamps = errorRecords.map(() => new Date());
			const records = errorRecords.map((record, index) => ({
				import_job_id: record.import_job_id,
				row_number: record.row_number,
				sheet_name: record.sheet_name,
				error_type: record.error_type,
				error_message: record.error_message,
				field_name: record.field_name,
				row_data: record.row_data || {},
				severity: record.severity,
				is_resolved: false,
				created_at: timestamps[index],
			}));

			const ids = await this.database('bt_import_errors').insert(records);
			return ids as number[];
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to batch log import errors:', error);
			throw error;
		}
	}

	/**
	 * 记录审计日志
	 */
	async logAction(auditRecord: AuditLogRecord): Promise<number> {
		try {
			const [id] = await this.database('bt_action_audit_logs').insert({
				action_type: auditRecord.action_type,
				action_category: auditRecord.action_category,
				target_type: auditRecord.target_type,
				target_id: auditRecord.target_id,
				target_name: auditRecord.target_name,
				operation_details: auditRecord.operation_details || {},
				changes_summary: auditRecord.changes_summary,
				performed_by_user_id: auditRecord.performed_by_user_id,
				performed_by_role_id: auditRecord.performed_by_role_id,
				user_ip_address: auditRecord.user_ip_address,
				user_agent: auditRecord.user_agent,
				status: auditRecord.status,
				result_message: auditRecord.result_message,
				risk_level: auditRecord.risk_level,
				requires_approval: false,
				created_at: new Date(),
			});

			return id as number;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to log audit action:', error);
			throw error;
		}
	}

	/**
	 * 获取错误统计信息
	 */
	async getErrorStatistics(importJobId: number): Promise<ErrorStatistics> {
		try {
			const errors = await this.database('bt_import_errors')
				.where('import_job_id', importJobId);

			const stats: ErrorStatistics = {
				total_errors: errors.length,
				by_severity: {} as Record<string, number>,
				by_type: {} as Record<string, number>,
				resolved_errors: 0,
				unresolved_errors: 0,
			};

			for (const error of errors) {
				// 按严重级别统计
				stats.by_severity[error.severity] = (stats.by_severity[error.severity] || 0) + 1;

				// 按错误类型统计
				stats.by_type[error.error_type] = (stats.by_type[error.error_type] || 0) + 1;

				// 按解决状态统计
				if (error.is_resolved) {
					stats.resolved_errors++;
				} else {
					stats.unresolved_errors++;
				}
			}

			return stats;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to get error statistics:', error);
			throw error;
		}
	}

	/**
	 * 清理旧的审计日志
	 */
	async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

			const deletedCount = await this.database('bt_action_audit_logs')
				.where('created_at', '<', cutoffDate)
				.where('risk_level', 'low')
				.delete();

			console.log(`[ImportAuditLogger] Cleaned up ${deletedCount} old low-risk audit logs`);
			return deletedCount;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to cleanup old logs:', error);
			throw error;
		}
	}

	/**
	 * 清理已解决的导入错误
	 */
	async cleanupResolvedErrors(daysToKeep: number = 30): Promise<number> {
		try {
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

			const deletedCount = await this.database('bt_import_errors')
				.where('is_resolved', true)
				.where('created_at', '<', cutoffDate)
				.delete();

			console.log(`[ImportAuditLogger] Cleaned up ${deletedCount} resolved import errors`);
			return deletedCount;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to cleanup resolved errors:', error);
			throw error;
		}
	}

	/**
	 * 标记错误为已解决
	 */
	async markErrorAsResolved(errorId: number, resolutionNotes?: string): Promise<boolean> {
		try {
			const updatedCount = await this.database('bt_import_errors')
				.where('id', errorId)
				.update({
					is_resolved: true,
					resolution_notes: resolutionNotes,
				});

			return updatedCount > 0;
		} catch (error) {
			console.error('[ImportAuditLogger] Failed to mark error as resolved:', error);
			throw error;
		}
	}

	/**
	 * 分析错误严重级别
	 */
	analyzeErrorSeverity(error: any, context?: any): ErrorSeverity {
		// 数据库约束违反
		if (error.code === '23505' || error.code === '23503' || error.code === '23502') {
			return ErrorSeverity.ERROR;
		}

		// 权限错误
		if (error.message?.includes('permission') || error.message?.includes('unauthorized')) {
			return ErrorSeverity.CRITICAL;
		}

		// 系统错误
		if (error.code?.startsWith('50') || error.code?.startsWith('59')) {
			return ErrorSeverity.CRITICAL;
		}

		// 验证错误
		if (error.message?.includes('validation') || error.message?.includes('invalid')) {
			return ErrorSeverity.WARNING;
		}

		// 默认为错误级别
		return ErrorSeverity.ERROR;
	}

	/**
	 * 分类错误类型
	 */
	categorizeError(error: any): ErrorType {
		const errorMessage = error.message?.toLowerCase() || '';

		if (errorMessage.includes('validation') || errorMessage.includes('valid')) {
			return ErrorType.VALIDATION;
		}

		if (errorMessage.includes('constraint') || errorMessage.includes('unique') || errorMessage.includes('foreign key')) {
			return ErrorType.CONSTRAINT;
		}

		if (errorMessage.includes('format') || errorMessage.includes('type') || errorMessage.includes('parse')) {
			return ErrorType.FORMAT;
		}

		if (errorMessage.includes('permission') || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
			return ErrorType.PERMISSION;
		}

		if (error.code?.startsWith('50') || error.code?.startsWith('59') || errorMessage.includes('database')) {
			return ErrorType.DATABASE;
		}

		return ErrorType.SYSTEM;
	}
}

/**
 * 性能监控装饰器
 */
export function measurePerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
	const method = descriptor.value;

	descriptor.value = async function (...args: any[]) {
		const start = Date.now();
		const className = target.constructor.name;

		try {
			const result = await method.apply(this, args);
			const duration = Date.now() - start;

			if (duration > 1000) {
				console.warn(`[Performance] ${className}.${propertyName} took ${duration}ms`);
			}

			return result;
		} catch (error) {
			const duration = Date.now() - start;
			console.error(`[Performance] ${className}.${propertyName} failed after ${duration}ms`, error);
			throw error;
		}
	};

	return descriptor;
}
